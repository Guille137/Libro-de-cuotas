import { buildRows, defaultState, localToday, migrateLegacy, toCents, validateConfig, validateDate, validateState, validateBookTitle } from '../domain/plan.js';
import { blobToDataUrl, dataUrlToBlob, validateImage } from '../infrastructure/receipts.js';

export class BookService {
  constructor(repository) { this.repository = repository; this.state = null; }
  async initialize(legacy) {
    const saved = await this.repository.load();
    this.state = saved ? validateState(saved) : legacy ? migrateLegacy(JSON.parse(legacy)) : defaultState();
    if (!saved) await this.repository.commit(this.state);
    return this.state;
  }
  async commit(next, changes) {
    const valid = validateState(next);
    const saved = await this.repository.commit(valid, changes);
    this.state = saved ?? valid;
    return this.state;
  }
  async updateRow(id, field, value) {
    const next = structuredClone(this.state);
    const row = next.rows.find(r => r.id === id);
    if (!row) throw new Error('La cuota ya no existe.');
    if (field === 'amount') row.amountCents = toCents(value);
    else if (field === 'note') row.note = value;
    else if (field === 'paidDate') row.paidDate = validateDate(value);
    else if (field === 'paid') { row.paid = Boolean(value); row.paidDate = row.paid ? row.paidDate || localToday() : ''; }
    else throw new Error('Campo inválido.');
    return this.commit(next);
  }
  async updateDetails(id, { amount, paid, paidDate, note }) {
    const next = structuredClone(this.state);
    const row = next.rows.find(r => r.id === id);
    if (!row) throw new Error('La cuota ya no existe.');
    if (typeof paid !== 'boolean') throw new Error('Seleccioná un estado de pago válido.');
    row.amountCents = toCents(amount);
    row.paid = paid;
    row.paidDate = paid ? validateDate(paidDate) : '';
    row.note = note;
    return this.commit(next);
  }
  async rename(value) {
    const title = validateBookTitle(value);
    if (title === this.state.title) return this.state;
    return this.commit({ ...this.state, title });
  }
  async regenerate(config) {
    const cfg = validateConfig(config);
    if (cfg.currency !== this.state.cfg.currency && this.state.rows.some(r => r.paid || r.receipt)) throw new Error('No se puede cambiar la moneda de un libro con pagos o comprobantes.');
    return this.commit({ ...this.state, cfg, rows: buildRows(cfg, this.state.rows) });
  }
  async attach(id, file) {
    const type = await validateImage(file);
    const next = structuredClone(this.state);
    const row = next.rows.find(r => r.id === id);
    if (!row) throw new Error('La cuota ya no existe.');
    const previous = row.receipt?.id;
    const receiptId = crypto.randomUUID();
    row.receipt = { id: receiptId, name: file.name.slice(0, 120), type, size: file.size };
    return this.commit(next, { put: [{ id: receiptId, blob: file }], remove: previous ? [previous] : [] });
  }
  async removeReceipt(id) {
    const next = structuredClone(this.state);
    const row = next.rows.find(r => r.id === id);
    if (!row?.receipt) throw new Error('No se encontró el comprobante.');
    const remove = [row.receipt.id];
    row.receipt = null;
    return this.commit(next, { remove });
  }
  async exportBackup() {
    const snapshot = await this.repository.snapshot();
    const state = validateState(snapshot.state);
    const receipts = snapshot.receipts;
    const files = new Map(receipts.map(r => [r.id, r.blob]));
    const encoded = [];
    for (const row of state.rows) {
      if (!row.receipt) continue;
      const blob = files.get(row.receipt.id);
      if (!blob) throw new Error('Falta un comprobante. No se generó un respaldo incompleto.');
      encoded.push({ id: row.receipt.id, data: await blobToDataUrl(blob) });
    }
    return JSON.stringify({ format: 'libro-cuotas', version: 2, state, receipts: encoded }, null, 2);
  }
  async importBackup(raw) {
    let state, put = [];
    if (raw?.format === 'libro-cuotas' && raw.version === 2) {
      state = validateState(raw.state);
      if (!Array.isArray(raw.receipts) || raw.receipts.length > state.rows.length) throw new Error('Lista de comprobantes inválida.');
      const files = new Map(raw.receipts.map(r => [r.id, r.data]));
      if (files.size !== raw.receipts.length) throw new Error('Comprobantes duplicados.');
      for (const row of state.rows) {
        if (row.receipt) {
          put.push({ id: row.receipt.id, blob: await dataUrlToBlob(files.get(row.receipt.id), row.receipt) });
          files.delete(row.receipt.id);
        }
      }
      if (files.size) throw new Error('El respaldo tiene comprobantes sin cuota.');
    } else {
      if (raw?.schemaVersion !== undefined || raw?.format !== undefined) throw new Error('Formato de respaldo no compatible.');
      state = migrateLegacy(raw);
    }
    return this.commit(state, { put, replace: true });
  }
  async reset() { return this.commit(defaultState(), { replace: true }); }
}
