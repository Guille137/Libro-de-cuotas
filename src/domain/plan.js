export const MAX_INSTALLMENTS = 600;
export const DEFAULT_BOOK_TITLE = 'Mi libro de cuotas';
export function validateBookTitle(value) {
  requireValue(typeof value === 'string', 'El título debe ser un texto.');
  const title = value.trim().normalize('NFC');
  requireValue(title.length > 0 && title.length <= 80 && !/[\u0000-\u001f\u007f]/.test(title), 'Escribí un título de entre 1 y 80 caracteres, en una sola línea.');
  return title;
}
export const MAX_RECEIPT_BYTES = 1024 * 1024;
export const MAX_TOTAL_RECEIPT_BYTES = 50 * 1024 * 1024;
const MAX_CENTS = 100_000_000_000;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function integer(value, min, max, label) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max, `${label}: valor inválido.`);
  return value;
}
function string(value, max, label) {
  requireValue(typeof value === 'string' && value.length <= max, `${label}: texto inválido.`);
  return value;
}
export function localToday(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validateDate(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'Fecha inválida.');
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  requireValue(y >= 1900 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d, 'Fecha fuera de rango o inexistente.');
  return value;
}
export function addMonths(start, offset) {
  validateDate(start);
  const [y, m, d] = start.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return validateDate(first.toISOString().slice(0, 10));
}
export function toCents(value) {
  const text = String(value).trim().replace(',', '.');
  requireValue(/^\d+(\.\d{1,2})?$/.test(text), 'Ingresá un importe positivo con hasta dos decimales.');
  const [whole, fraction = ''] = text.split('.');
  return integer(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), 0, MAX_CENTS, 'Importe');
}
export function validateConfig(raw) {
  requireValue(raw && typeof raw === 'object', 'Configuración inválida.');
  const cfg = {
    start: validateDate(raw.start),
    totalMonths: integer(raw.totalMonths, 1, MAX_INSTALLMENTS, 'Cantidad de cuotas'),
    initCents: integer(raw.initCents, 0, MAX_CENTS, 'Importe inicial'),
    initMonths: integer(raw.initMonths, 0, raw.totalMonths, 'Cuotas iniciales'),
    laterCents: integer(raw.laterCents, 0, MAX_CENTS, 'Importe posterior'),
    currency: raw.currency,
  };
  requireValue(['USD', 'ARS', 'EUR'].includes(cfg.currency), 'Moneda inválida.');
  addMonths(cfg.start, cfg.totalMonths - 1);
  return cfg;
}
function validateReceipt(raw) {
  if (raw === null || raw === undefined) return null;
  requireValue(raw && typeof raw === 'object', 'Comprobante inválido.');
  requireValue(typeof raw.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(raw.id), 'ID de comprobante inválido.');
  requireValue(TYPES.includes(raw.type), 'Solo se admiten imágenes JPEG, PNG o WebP.');
  return { id: raw.id, name: string(raw.name, 120, 'Nombre de comprobante'), type: raw.type, size: integer(raw.size, 1, MAX_RECEIPT_BYTES, 'Tamaño del comprobante') };
}
export function validateState(raw) {
  requireValue(raw?.schemaVersion === 2, 'Versión de respaldo no compatible.');
  const cfg = validateConfig(raw.cfg);
  requireValue(Array.isArray(raw.rows) && raw.rows.length === cfg.totalMonths, 'Cantidad de cuotas inconsistente.');
  const ids = new Set();
  const receiptIds = new Set();
  let bytes = 0;
  const rows = raw.rows.map((r, i) => {
    requireValue(r && typeof r === 'object' && typeof r.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(r.id) && !ids.has(r.id), 'ID de cuota inválido o duplicado.');
    ids.add(r.id);
    const due = validateDate(r.due);
    requireValue(due === addMonths(cfg.start, i), 'Calendario inconsistente con la configuración.');
    requireValue(typeof r.paid === 'boolean', 'Estado de pago inválido.');
    const paidDate = r.paid ? validateDate(r.paidDate) : '';
    const receipt = validateReceipt(r.receipt);
    if (receipt) {
      requireValue(!receiptIds.has(receipt.id), 'Comprobante duplicado.');
      receiptIds.add(receipt.id);
      bytes += receipt.size;
    }
    return { id: r.id, due, amountCents: integer(r.amountCents, 0, MAX_CENTS, 'Importe'), paid: r.paid, paidDate, note: string(r.note, 1000, 'Nota'), receipt };
  });
  requireValue(bytes <= MAX_TOTAL_RECEIPT_BYTES, 'Los comprobantes superan el límite local de 50 MiB.');
  return { schemaVersion: 2, title: validateBookTitle(raw.title === undefined ? DEFAULT_BOOK_TITLE : raw.title), cfg, rows };
}
export function buildRows(config, existing = [], newId = () => crypto.randomUUID()) {
  const cfg = validateConfig(config);
  const byDate = new Map(existing.map(row => [row.due, row]));
  const rows = Array.from({ length: cfg.totalMonths }, (_, i) => {
    const due = addMonths(cfg.start, i);
    const previous = byDate.get(due);
    // Conservar cuotas con historial; recalcular las pendientes sin notas ni evidencias.
    const protectedRow = previous && (previous.paid || previous.note || previous.receipt);
    return protectedRow ? { ...previous } : {
      id: previous?.id ?? newId(), due,
      amountCents: i < cfg.initMonths ? cfg.initCents : cfg.laterCents,
      paid: false, paidDate: '', note: '', receipt: null,
    };
  });
  const dates = new Set(rows.map(row => row.due));
  requireValue(!existing.some(row => !dates.has(row.due) && (row.paid || row.note || row.receipt)), 'El cambio quitaría cuotas con pagos, notas o comprobantes. Exportá el historial y creá otro libro para cambiar esas fechas.');
  return rows;
}
export function defaultState(today = localToday()) {
  const cfg = { start: `${today.slice(0, 7)}-01`, totalMonths: 58, initCents: 60000, initMonths: 10, laterCents: 50000, currency: 'USD' };
  return { schemaVersion: 2, title: DEFAULT_BOOK_TITLE, cfg, rows: buildRows(cfg) };
}
export function migrateLegacy(raw) {
  requireValue(raw?.cfg && Array.isArray(raw.rows), 'Respaldo antiguo inválido.');
  const cfg = validateConfig({ ...raw.cfg, initCents: toCents(raw.cfg.initAmt), laterCents: toCents(raw.cfg.laterAmt), currency: 'USD' });
  return validateState({ schemaVersion: 2, cfg, rows: raw.rows.map(r => ({
    id: crypto.randomUUID(), due: r.due, amountCents: toCents(r.amount), paid: r.paid,
    paidDate: r.paidDate, note: r.note ?? '', receipt: null,
  })) });
}
export function totals(state, today = localToday()) {
  let paid = 0, remaining = 0, overdue = 0;
  for (const row of state.rows) {
    if (row.paid) paid += row.amountCents;
    else { remaining += row.amountCents; if (row.due < today) overdue += row.amountCents; }
  }
  return { paid, remaining, overdue, next: state.rows.find(r => !r.paid) ?? null };
}
