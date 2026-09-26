import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, buildRows, defaultState, localToday, migrateLegacy, toCents, totals, validateState } from '../src/domain/plan.js';
import { BookService } from '../src/application/book-service.js';
import { validateImage } from '../src/infrastructure/receipts.js';

test('58 cuotas por defecto, con extremos y montos explícitos', () => {
  const state = defaultState('2026-01-20');
  assert.equal(state.rows.length, 58);
  assert.equal(state.rows.at(-1).due, '2030-10-01');
  assert.equal(totals(state).remaining, 3_000_000);
});
test('fin de mes, año bisiesto y recuperación del día original', () => {
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonths('2025-01-31', 2), '2025-03-31');
  assert.equal(addMonths('2025-12-31', 1), '2026-01-31');
});
test('fecha local sin conversión a UTC', () => {
  assert.equal(localToday(new Date(2026, 8, 25, 23, 59)), '2026-09-25');
});
test('importes exactos y rechazo de negativos, infinitos y decimales extra', () => {
  assert.equal(toCents('0.10') + toCents('0.20'), 30);
  assert.equal(toCents('12,35'), 1235);
  for (const bad of [-1, '', NaN, Infinity, '1e3', '0.001', '1000000001']) assert.throws(() => toCents(bad));
});
test('pagos se conservan por vencimiento y no por posición', () => {
  const state = defaultState('2026-01-01');
  state.rows[1].paid = true; state.rows[1].paidDate = '2026-02-03';
  state.rows[1].amountCents = 12345;
  const rows = buildRows({ ...state.cfg, start: '2026-02-01', totalMonths: 57 }, state.rows);
  assert.equal(rows[0].id, state.rows[1].id);
  assert.equal(rows[0].amountCents, 12345);
  assert.equal(rows[0].paidDate, '2026-02-03');
});
test('no eliminar cuotas con historial al reducir o cambiar fechas', () => {
  const state = defaultState();
  state.rows.at(-1).note = 'Acuerdo';
  assert.throws(() => buildRows({ ...state.cfg, totalMonths: 57 }, state.rows), /quitaría/);
});
test('recalcula pendientes sin historial y conserva notas', () => {
  const state = defaultState();
  state.rows[1].note = 'Monto acordado';
  const rows = buildRows({ ...state.cfg, initCents: 80000 }, state.rows);
  assert.equal(rows[0].amountCents, 80000);
  assert.equal(rows[1].amountCents, 60000);
});
test('respaldo rechaza importes, fechas, IDs y tamaños inválidos', () => {
  for (const mutate of [
    s => { s.rows[0].amountCents = -1; },
    s => { s.rows[0].due = '2026-02-30'; },
    s => { s.rows[0].paid = 'false'; },
    s => { s.rows[0].note = 'a'.repeat(1001); },
    s => { s.rows[0].id = s.rows[1].id; },
    s => { s.cfg.totalMonths = 1000000; },
    s => { s.rows[0].paid = true; s.rows[0].paidDate = ''; },
  ]) { const state = defaultState(); mutate(state); assert.throws(() => validateState(state)); }
});
test('contenido HTML se mantiene como texto y campos adicionales se descartan', () => {
  const state = defaultState();
  state.rows[0].note = '\"><img src=x onerror=alert(1)>';
  state.rows[0].admin = true;
  const valid = validateState(state);
  assert.equal(valid.rows[0].note, state.rows[0].note);
  assert.equal(valid.rows[0].admin, undefined);
});
test('la migración conserva las 60 cuotas y pagos de un libro anterior', () => {
  const base = defaultState('2026-01-01');
  const cfg = { ...base.cfg, totalMonths: 60 };
  const rows = buildRows(cfg).map(r => ({ due: r.due, amount: r.amountCents / 100, paid: false, paidDate: '', note: '' }));
  rows[2].paid = true; rows[2].paidDate = '2026-03-05';
  const state = migrateLegacy({ cfg: { start: cfg.start, totalMonths: 60, initAmt: 600, initMonths: 10, laterAmt: 500 }, rows });
  assert.equal(state.rows.length, 60);
  assert.equal(state.rows[2].paidDate, '2026-03-05');
});
test('primera cuota pendiente prioriza deuda vencida', () => {
  const state = defaultState('2026-01-01');
  const result = totals(state, '2026-03-15');
  assert.equal(result.next.due, '2026-01-01');
  assert.equal(result.overdue, 180000);
});
function repository(state = defaultState()) {
  return {
    saved: structuredClone(state), files: new Map(),
    async load() { return this.saved; },
    async commit(next, changes = {}) {
      if (this.fail) throw new Error('Sin espacio');
      this.saved = structuredClone(next);
      if (changes.replace) this.files.clear();
      for (const id of changes.remove ?? []) this.files.delete(id);
      for (const item of changes.put ?? []) this.files.set(item.id, item.blob);
    },
    async snapshot() { return { state: this.saved, receipts: [...this.files].map(([id, blob]) => ({ id, blob })) }; },
  };
}
test('fallo de persistencia no publica cambios en la aplicación', async () => {
  const repo = repository(); const service = new BookService(repo); await service.initialize();
  repo.fail = true;
  await assert.rejects(service.updateRow(service.state.rows[0].id, 'paid', true), /Sin espacio/);
  assert.equal(service.state.rows[0].paid, false);
});
test('cambiar la moneda con pagos se rechaza', async () => {
  const service = new BookService(repository()); await service.initialize();
  await service.updateRow(service.state.rows[0].id, 'paid', true);
  await assert.rejects(service.regenerate({ ...service.state.cfg, currency: 'ARS' }), /moneda/);
});
const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'captura.png', { type: 'image/png' });
test('filtro de archivos rechaza SVG y tipo MIME falsificado', async () => {
  await assert.rejects(validateImage(new Blob(['<svg/>'], { type: 'image/svg+xml' })));
  await assert.rejects(validateImage(new Blob(['<script/>'], { type: 'image/png' })));
  await assert.rejects(validateImage(new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/png' })));
});
test('adjuntar y quitar comprobante conserva el estado del pago', async () => {
  const repo = repository(); const service = new BookService(repo); await service.initialize();
  const id = service.state.rows[0].id;
  await service.attach(id, png());
  assert.equal(repo.files.size, 1);
  assert.equal(service.state.rows[0].paid, false);
  await service.attach(id, png());
  assert.equal(repo.files.size, 1);
  await service.removeReceipt(id);
  assert.equal(repo.files.size, 0);
});
test('importación inválida con comprobante faltante no reemplaza el libro', async () => {
  const repo = repository(); const service = new BookService(repo); await service.initialize();
  await service.attach(service.state.rows[0].id, png());
  const before = structuredClone(service.state);
  await assert.rejects(service.importBackup({ format: 'libro-cuotas', version: 2, state: before, receipts: [] }));
  assert.deepEqual(service.state, before);
  assert.equal(repo.files.size, 1);
});
test('restauración de comprobante valida contenido y reemplaza en un solo commit', async () => {
  const repo = repository(); const service = new BookService(repo); await service.initialize();
  await service.attach(service.state.rows[0].id, png());
  const state = structuredClone(service.state);
  const id = state.rows[0].receipt.id;
  const data = `data:image/png;base64,${Buffer.from(await png().arrayBuffer()).toString('base64')}`;
  await service.reset();
  await service.importBackup({ format: 'libro-cuotas', version: 2, state, receipts: [{ id, data }] });
  assert.equal(repo.files.size, 1);
  assert.equal(service.state.rows[0].receipt.id, id);
});
