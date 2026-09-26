import { localToday, totals } from '../domain/plan.js';
import { dateLabel, money, selectRows, PAGE_SIZE } from './ledger-model.js';
export const byId = id => document.getElementById(id);
export const ledgerState = { filter: 'all', query: '', page: 1 };
let lastConfig;
export function notify(message, error = false) {
  byId('status').textContent = message;
  byId('status').className = error ? 'error' : '';
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function action(label, name, row, number, className = 'row-action') {
  const button = element('button', label, className);
  button.type = 'button'; button.dataset.action = name; button.dataset.id = row.id;
  button.setAttribute('aria-label', `${label}, cuota ${number}`);
  return button;
}
export function renderLedger(state) {
  const result = selectRows(state, ledgerState);
  ledgerState.page = result.page;
  const fragment = document.createDocumentFragment();
  for (const { row, number, overdue } of result.rows) {
    const tr = element('tr'); tr.dataset.id = row.id;
    const title = element('td');
    title.append(element('strong', `Cuota ${String(number).padStart(2, '0')}`), element('small', dateLabel(row.due)));
    if (row.note) title.append(element('small', row.note, 'row-note'));
    const amount = element('td', money(row.amountCents, state.cfg.currency), 'amount');
    const status = element('td');
    status.append(element('span', row.paid ? 'Pagada' : overdue ? 'Vencida' : 'Pendiente', `status-badge ${row.paid ? 'paid' : overdue ? 'overdue' : ''}`));
    if (row.paid) status.append(element('small', `Pago: ${dateLabel(row.paidDate)}`));
    const receipt = element('td');
    receipt.append(row.receipt ? action('Ver imagen', 'view', row, number, 'receipt-link') : element('span', 'Sin imagen', 'no-receipt'));
    const actions = element('td');
    actions.append(action(row.paid ? 'Ver detalle' : 'Registrar pago', row.paid ? 'edit' : 'pay', row, number, `row-action ${row.paid ? '' : 'pay'}`));
    if (!row.paid) {
      const detail = action('Detalle', 'edit', row, number, 'text-button');
      detail.classList.add('detail-action');
      actions.append(detail);
    }
    tr.append(title, amount, status, receipt, actions); fragment.append(tr);
  }
  byId('rows').replaceChildren(fragment);
  for (const [filter, id] of Object.entries({ all: 'countAll', pending: 'countPending', overdue: 'countOverdue', paid: 'countPaid' })) byId(id).textContent = result.counts[filter];
  document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === ledgerState.filter)));
  byId('count').textContent = result.total ? `${(result.page - 1) * PAGE_SIZE + 1}–${Math.min(result.page * PAGE_SIZE, result.total)} de ${result.total} cuotas` : '0 cuotas';
  byId('pageLabel').textContent = `${result.page} / ${result.pages}`;
  byId('btnPrevious').disabled = result.page <= 1;
  byId('btnNext').disabled = result.page >= result.pages;
  byId('emptyState').hidden = result.total > 0;
  const noOverdue = ledgerState.filter === 'overdue' && !ledgerState.query;
  const noPaid = ledgerState.filter === 'paid' && !ledgerState.query;
  byId('emptyTitle').textContent = noOverdue ? 'No tenés cuotas vencidas' : noPaid ? 'Todavía no registraste pagos' : 'No encontramos cuotas';
  byId('emptyDescription').textContent = noOverdue ? 'Podés revisar las próximas cuotas por pagar.' : noPaid ? 'Abrí una cuota y elegí Registrar pago cuando hayas pagado.' : 'Probá con otro número, fecha o nota, o quitá el filtro.';
}
export function render(state) {
  byId('bookTitle').textContent = state.title;
  document.title = `${state.title} · Cuotas`;
  const { cfg } = state;
  if (lastConfig !== JSON.stringify(cfg)) {
    byId('cfgStart').value = cfg.start; byId('cfgTotal').value = cfg.totalMonths;
    byId('cfgInitAmt').value = (cfg.initCents / 100).toFixed(2); byId('cfgInitMonths').value = cfg.initMonths;
    byId('cfgLaterAmt').value = (cfg.laterCents / 100).toFixed(2); byId('cfgCurrency').value = cfg.currency;
    lastConfig = JSON.stringify(cfg);
  }
  const summary = totals(state);
  const paidCount = state.rows.filter(row => row.paid).length;
  const percent = Math.round(paidCount / state.rows.length * 100);
  byId('progressPercent').textContent = `${percent}%`;
  byId('planProgress').value = percent;
  byId('progressCount').textContent = `${paidCount} de ${state.rows.length} cuotas pagadas`;
  byId('progressDescription').textContent = `${state.rows.length - paidCount} cuotas por pagar.`;
  byId('stPagado').textContent = money(summary.paid, cfg.currency);
  byId('stRestante').textContent = money(summary.remaining, cfg.currency);
  byId('stVencido').textContent = money(summary.overdue, cfg.currency);
  const next = summary.next;
  const overdueCount = state.rows.filter(row => !row.paid && row.due < localToday()).length;
  byId('nextEyebrow').textContent = overdueCount ? `${overdueCount} ${overdueCount === 1 ? 'CUOTA VENCIDA' : 'CUOTAS VENCIDAS'}` : next ? 'PRÓXIMA CUOTA POR PAGAR' : 'PLAN COMPLETO';
  byId('nextTitle').textContent = next ? `Cuota ${String(state.rows.indexOf(next) + 1).padStart(2, '0')}` : 'Todas tus cuotas están pagadas';
  byId('nextDescription').textContent = next ? `${next.due < localToday() ? 'Venció el' : 'Vence el'} ${dateLabel(next.due)}` : 'Podés descargar una copia de tu historial.';
  byId('stProxima').textContent = next ? money(next.amountCents, cfg.currency) : '';
  byId('btnNextPay').hidden = !next;
  byId('btnNextPay').dataset.id = next?.id ?? '';
  byId('btnSeeOverdue').hidden = !overdueCount;
  byId('planSummary').textContent = `${cfg.totalMonths} cuotas mensuales · ${cfg.currency} · Hasta ${dateLabel(state.rows.at(-1).due)}`;
  byId('configSummary').textContent = `${cfg.totalMonths} cuotas · ${cfg.currency} · Desde ${dateLabel(cfg.start)}`;
  byId('caption').textContent = `Calendario de ${cfg.totalMonths} cuotas en ${cfg.currency}.`;
  renderLedger(state);
}
export function renderReceipt(row) {
  byId('receiptUploadLabel').textContent = row.receipt ? 'Reemplazar imagen' : 'Adjuntar imagen';
  byId('btnViewReceipt').hidden = !row.receipt; byId('btnRemoveReceipt').hidden = !row.receipt;
  byId('receiptDescription').textContent = row.receipt ? `${row.receipt.name}. Adjuntar o quitar una imagen no cambia el estado del pago.` : 'Podés adjuntarlo ahora o después. La imagen se guarda por separado y no cambia el estado del pago.';
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob); const link = element('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
