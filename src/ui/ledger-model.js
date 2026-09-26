import { localToday } from '../domain/plan.js';

export const PAGE_SIZE = 12;
export function dateLabel(iso) {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
}
export function money(cents, currency) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, currencyDisplay: 'code' }).format(cents / 100);
}
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function selectRows(state, { filter = 'all', query = '', page = 1, today = localToday() } = {}) {
  const needle = normalize(query);
  const numberQuery = /^(?:cuota\s*|#)?(\d{1,3})$/.exec(needle);
  const counts = { all: state.rows.length, pending: 0, overdue: 0, paid: 0 };
  const matched = state.rows.flatMap((row, index) => {
    const overdue = !row.paid && row.due < today;
    counts[row.paid ? 'paid' : 'pending']++;
    if (overdue) counts.overdue++;
    const valid = filter === 'all' || filter === 'paid' && row.paid || filter === 'pending' && !row.paid || filter === 'overdue' && overdue;
    const text = normalize(`${index + 1} ${String(index + 1).padStart(2, '0')} ${row.due} ${dateLabel(row.due)} ${row.note}`);
    const matches = numberQuery ? index + 1 === Number(numberQuery[1]) : !needle || text.includes(needle);
    return valid && matches ? [{ row, number: index + 1, overdue }] : [];
  });
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pages);
  return { rows: matched.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), total: matched.length, page: currentPage, pages, counts };
}
