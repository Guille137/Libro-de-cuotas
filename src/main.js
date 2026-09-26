import { toCents, localToday, buildRows, validateConfig, totals } from './domain/plan.js';
import { BookService } from './application/book-service.js';
import { openRepository } from './infrastructure/indexed-db.js';
import { byId, download, notify, render, renderLedger, renderReceipt, ledgerState } from './ui/view.js';
import { dateLabel, money } from './ui/ledger-model.js';
import { confirmAction } from './ui/dialogs.js';
import { createFirebaseClient } from './infrastructure/firebase-client.js';
import { createFirestoreRepository } from './infrastructure/firestore-repository.js';
import { optimizeImage } from './infrastructure/image-processing.js';
import { setupAccess } from './ui/access.js';

let service, localService, cloudClient, cloudUser, editorId, editorInitial, previewUrl, uploadUrl, pendingUpload;
let busy = false, authTransition = false;
const inCloud = () => service?.repository.kind === 'cloud';
const editorRow = () => service?.state.rows.find(row => row.id === editorId);
const editorValues = () => ({ amount: byId('editAmount').value, paid: byId('editStatus').value === 'paid', paidDate: byId('editPaidDate').value, note: byId('editNote').value });
const editorDirty = () => byId('editDialog').open && editorInitial !== JSON.stringify(editorValues());
function showBook(show) {
  byId('landing').hidden = show;
  byId('bookScreen').hidden = !show;
  byId('modeBadge').hidden = !show;
  document.body.classList.toggle('landing-mode', !show);
  byId('skipLink').href = show ? '#ledgerTitle' : '#entryTitle';
  window.scrollTo(0, 0);
  if (show) byId('bookTitle').setAttribute('tabindex', '-1');
  (show ? byId('bookTitle') : byId('entryTitle')).focus({ preventScroll: true });
}
const access = setupAccess({
  getClient: () => cloudClient,
  onLocal: () => showBook(true),
  onAuthenticated: async user => {
    authTransition = true;
    try {
      const success = await run(async () => { await openCloud(user); }, 'Cuenta conectada. Tu libro local se conserva por separado.');
      if (!success) throw new Error('No se pudo abrir el libro.');
      showBook(true);
    } finally { authTransition = false; }
  },
});
byId('modeBadge').hidden = true;
function errorAt(id, message = '') { byId(id).textContent = message; byId(id).hidden = !message; }
function accountView() {
  const cloud = inCloud();
  byId('modeBadge').textContent = cloud ? 'En mi cuenta' : 'En este dispositivo';
  byId('storageSummary').textContent = cloud ? 'Guardado en tu cuenta · Copias de seguridad' : 'Solo en este navegador · Descargá una copia para conservarlo';
  byId('accountTitle').textContent = cloud ? cloudUser.email : 'Tu libro local';
  byId('accountDescription').textContent = cloud ? 'Los cambios se guardan en tu cuenta. Actualizá para traer cambios de otro dispositivo.' : cloudClient ? 'Este libro se guarda en el navegador. Iniciá sesión para abrir el libro de tu cuenta.' : 'Este libro se guarda solo en este navegador. La conexión con una cuenta todavía no está disponible; podés descargar una copia de seguridad.';
  byId('btnLogin').hidden = cloud || !cloudClient;
  for (const id of ['btnLogout', 'btnRefresh', 'btnUploadLocal']) byId(id).hidden = !cloud;
  byId('btnReset').textContent = cloud ? 'Borrar libro de mi cuenta' : 'Borrar libro local';
}
async function openCloud(user) {
  if (!user.emailVerified) throw new Error('Verificá tu correo antes de abrir el libro de tu cuenta.');
  const repository = createFirestoreRepository(cloudClient.db, user.uid, () => {
    if (cloudClient.auth.currentUser?.uid !== user.uid) throw new Error('La sesión cambió. Volvé a conectar tu cuenta.');
    if (!navigator.onLine) throw new Error('No hay conexión. Conectate a Internet y volvé a intentar; todavía no se guardó el cambio.');
  });
  const next = new BookService(repository); await next.initialize(); service = next; cloudUser = user;
  ledgerState.page = 1;
}
function restoreRowFocus(id) {
  const button = Array.from(byId('rows').querySelectorAll('button')).find(node => node.dataset.id === id && ['edit', 'pay'].includes(node.dataset.action));
  (button ?? byId('ledgerTitle')).focus({ preventScroll: true });
}
async function run(operation, message, errorId, progressMessage = 'Guardando… Esperá la confirmación antes de cerrar.') {
  if (busy) return false;
  busy = true;
  byId('btnRename').disabled = true;
  const focused = document.activeElement;
  const rowId = focused?.dataset.id || editorId;
  const controls = Array.from(document.querySelectorAll('dialog[open] button, dialog[open] input, dialog[open] select, dialog[open] textarea')).map(node => [node, node.disabled]);
  controls.forEach(([node]) => { node.disabled = true; });
  byId('app').disabled = true; byId('app').setAttribute('aria-busy', 'true');
  if (errorId) errorAt(errorId);
  notify(progressMessage);
  let success = false;
  try {
    await operation(); render(service.state); accountView();
    if (byId('editDialog').open && editorRow()) renderReceipt(editorRow());
    notify(message ?? (inCloud() ? 'Cambios guardados en tu cuenta.' : 'Cambios guardados en este dispositivo.'));
    if (service.repository.cleanupPending) notify('El libro se guardó. Quedó pendiente la limpieza de una imagen anterior en la nube.', true);
    success = true;
  } catch (error) {
    const message = `No se pudo completar: ${error.message}`;
    notify(message, true);
    if (errorId) errorAt(errorId, `${message} Tus datos escritos siguen en el formulario.`);
  } finally {
    busy = false; byId('app').disabled = !service?.state; byId('app').removeAttribute('aria-busy');
    byId('btnRename').disabled = !service?.state;
    controls.forEach(([node, disabled]) => { node.disabled = disabled; });
    const modal = Array.from(document.querySelectorAll('dialog[open]')).at(-1);
    if (modal) {
      if (focused?.isConnected && modal.contains(focused) && !focused.disabled) focused.focus({ preventScroll: true });
      else modal.querySelector('button:not(:disabled), input:not(:disabled)')?.focus({ preventScroll: true });
    } else if (focused?.isConnected && !focused.closest('dialog') && !focused.disabled) focused.focus({ preventScroll: true });
    else if (focused?.closest('#renameDialog')) byId('btnRename').focus();
    else if (rowId) restoreRowFocus(rowId);
  }
  return success;
}
byId('btnRename').addEventListener('click', () => {
  if (busy || !service?.state) return;
  byId('bookTitleInput').value = service.state.title;
  errorAt('renameError'); byId('renameDialog').showModal(); byId('bookTitleInput').select();
});
byId('btnCancelTitle').addEventListener('click', () => byId('renameDialog').close());
byId('renameForm').addEventListener('submit', event => {
  event.preventDefault();
  const title = byId('bookTitleInput').value;
  void run(async () => { await service.rename(title); byId('renameDialog').close(); }, 'Título guardado.', 'renameError');
});
function updatePaymentFields() {
  const paid = byId('editStatus').value === 'paid';
  byId('paidDateField').hidden = !paid; byId('editPaidDate').required = paid; byId('editPaidDate').disabled = !paid;
  byId('btnSaveEdit').textContent = paid && !editorRow()?.paid ? 'Guardar pago' : 'Guardar cambios';
}
function openEditor(id, payment = false) {
  if (busy) return;
  editorId = id; const row = editorRow(); if (!row) return;
  const number = service.state.rows.indexOf(row) + 1;
  byId('editTitle').textContent = `Cuota ${String(number).padStart(2, '0')}`;
  byId('editKicker').textContent = payment ? 'REGISTRAR PAGO' : 'DETALLE DE CUOTA';
  byId('editSubtitle').textContent = `Vencimiento: ${dateLabel(row.due)}. Los cambios se aplican al guardar.`;
  byId('editAmountLabel').textContent = `Monto de la cuota (${service.state.cfg.currency})`;
  byId('editAmount').value = (row.amountCents / 100).toFixed(2);
  byId('editStatus').value = payment || row.paid ? 'paid' : 'pending';
  byId('editPaidDate').value = row.paidDate || localToday(); byId('editNote').value = row.note;
  errorAt('editError'); renderReceipt(row); updatePaymentFields();
  editorInitial = JSON.stringify(editorValues());
  byId('editDialog').showModal();
  (payment ? byId('editPaidDate') : byId('editAmount')).focus();
}
async function closeEditor() {
  if (busy) return;
  if (editorDirty() && !await confirmAction({ title: '¿Salir sin guardar los cambios?', description: 'Los cambios de monto, estado, fecha y nota se perderán. Las imágenes que ya guardaste se conservarán.', label: 'Salir sin guardar' })) return;
  byId('editDialog').close(); restoreRowFocus(editorId);
}
byId('editStatus').addEventListener('change', updatePaymentFields);
byId('btnCloseEdit').addEventListener('click', closeEditor);
byId('btnCancelEdit').addEventListener('click', closeEditor);
byId('editDialog').addEventListener('cancel', event => { event.preventDefault(); void closeEditor(); });
byId('editForm').addEventListener('submit', event => {
  event.preventDefault();
  const values = editorValues(); const wasPaid = editorRow().paid;
  void run(async () => { await service.updateDetails(editorId, values); byId('editDialog').close(); }, values.paid && !wasPaid ? 'Pago registrado. Podés abrir el detalle para corregirlo o adjuntar un comprobante.' : 'Cambios guardados.', 'editError');
});
byId('btnNextPay').addEventListener('click', () => openEditor(byId('btnNextPay').dataset.id, true));
byId('rows').addEventListener('click', event => {
  const target = event.target.closest('button[data-action]'); if (!target || busy) return;
  if (target.dataset.action === 'view') void viewReceipt(target.dataset.id);
  else openEditor(target.dataset.id, target.dataset.action === 'pay');
});
function filterChanged(filter) { ledgerState.filter = filter; ledgerState.page = 1; renderLedger(service.state); }
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => filterChanged(button.dataset.filter)));
byId('search').addEventListener('input', event => { ledgerState.query = event.target.value; ledgerState.page = 1; renderLedger(service.state); });
byId('btnClearFilters').addEventListener('click', () => { ledgerState.query = ''; byId('search').value = ''; filterChanged('all'); byId('search').focus(); });
byId('btnSeeOverdue').addEventListener('click', () => { ledgerState.query = ''; byId('search').value = ''; filterChanged('overdue'); byId('ledgerTitle').focus(); });
for (const [id, delta] of [['btnPrevious', -1], ['btnNext', 1]]) byId(id).addEventListener('click', () => { ledgerState.page += delta; renderLedger(service.state); byId('ledgerTitle').focus(); });
byId('btnConfigure').addEventListener('click', () => { byId('cfgBox').open = true; byId('cfgStart').focus(); });
byId('modeBadge').addEventListener('click', () => { byId('storageBox').open = true; });
byId('configForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; errorAt('configError');
  try {
    const cfg = validateConfig({ start: byId('cfgStart').value, totalMonths: Number(byId('cfgTotal').value), initCents: toCents(byId('cfgInitAmt').value), initMonths: Number(byId('cfgInitMonths').value), laterCents: toCents(byId('cfgLaterAmt').value), currency: byId('cfgCurrency').value });
    if (cfg.currency !== service.state.cfg.currency && service.state.rows.some(row => row.paid || row.receipt)) throw new Error('No se puede cambiar la moneda de un libro con pagos o comprobantes.');
    const rows = buildRows(cfg, service.state.rows);
    const old = new Map(service.state.rows.map(row => [row.due, row]));
    const changed = rows.filter(row => old.has(row.due) && old.get(row.due).amountCents !== row.amountCents).length;
    const added = rows.filter(row => !old.has(row.due)).length;
    const removed = service.state.rows.filter(row => !rows.some(next => next.due === row.due)).length;
    const total = totals({ rows }).paid + totals({ rows }).remaining;
    if (await confirmAction({ title: 'Revisá tu nuevo calendario', description: `${cfg.totalMonths} cuotas en ${cfg.currency}, desde ${dateLabel(cfg.start)} hasta ${dateLabel(rows.at(-1).due)}.\nTotal del plan: ${money(total, cfg.currency)}.\n\n${changed} montos cambian · ${added} cuotas nuevas · ${removed} cuotas se quitan.\nLas cuotas con historial se conservan.`, label: 'Guardar calendario' })) {
      await run(async () => { await service.regenerate(cfg); ledgerState.page = 1; byId('cfgBox').open = false; }, 'Calendario actualizado.', 'configError');
    }
  } catch (error) { errorAt('configError', error.message); }
});
async function viewReceipt(id) {
  const row = service.state.rows.find(row => row.id === id);
  await run(async () => {
    const blob = await service.repository.readReceipt(row.receipt.id); if (!blob) throw new Error('No se encontró el comprobante.');
    previewUrl = URL.createObjectURL(blob); byId('previewImage').src = previewUrl;
    byId('previewName').textContent = `Cuota ${service.state.rows.indexOf(row) + 1} · ${row.receipt.name}`;
    byId('downloadReceipt').href = previewUrl;
    byId('downloadReceipt').download = `comprobante-${row.due}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type]}`;
    byId('preview').showModal();
  }, 'Comprobante abierto.', byId('editDialog').open ? 'editError' : undefined, 'Abriendo comprobante…');
}
byId('btnViewReceipt').addEventListener('click', () => viewReceipt(editorId));
byId('btnRemoveReceipt').addEventListener('click', async () => {
  if (await confirmAction({ title: '¿Quitar la imagen de esta cuota?', description: 'La cuota y su estado de pago se conservan. Para recuperar la imagen necesitarás adjuntarla otra vez o restaurar una copia.', label: 'Quitar imagen', danger: true })) await run(() => service.removeReceipt(editorId), 'Imagen quitada. El pago no cambió.', 'editError');
});
byId('receiptInput').addEventListener('change', event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  void run(async () => {
    const optimized = await optimizeImage(file); pendingUpload = { id: editorId, file: optimized };
    uploadUrl = URL.createObjectURL(optimized); byId('uploadImage').src = uploadUrl;
    byId('uploadInfo').textContent = `Se guardará una copia optimizada (${Math.max(1, Math.round(optimized.size / 1024))} KB). Conservá el original si lo necesitás.`;
    errorAt('uploadError'); byId('uploadPreview').showModal();
  }, 'Imagen preparada. Revisá que los datos se lean bien.', 'editError', 'Preparando la vista previa… La imagen todavía no se guardó.');
});
byId('btnConfirmUpload').addEventListener('click', () => {
  if (!pendingUpload || busy) return;
  const upload = pendingUpload;
  void run(async () => { await service.attach(upload.id, upload.file); byId('uploadPreview').close(); }, 'Imagen guardada. El estado de pago no cambió.', 'uploadError');
});
byId('btnCancelUpload').addEventListener('click', () => byId('uploadPreview').close());
byId('uploadPreview').addEventListener('close', () => { if (uploadUrl) URL.revokeObjectURL(uploadUrl); uploadUrl = null; pendingUpload = null; byId('uploadImage').removeAttribute('src'); });
byId('preview').addEventListener('close', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; byId('previewImage').removeAttribute('src'); byId('downloadReceipt').removeAttribute('href'); });
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
byId('btnExport').addEventListener('click', () => { void run(async () => download(new Blob([await service.exportBackup()], { type: 'application/json' }), `cuotas-copia-${localToday()}.json`), 'Copia preparada para descargar. Incluye las cuotas y sus comprobantes.'); });
byId('btnImportTrigger').addEventListener('click', () => byId('fileImport').click());
byId('fileImport').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (await confirmAction({ title: '¿Restaurar esta copia?', description: `${file.name}\nReemplazará todas las cuotas e imágenes ${inCloud() ? 'de tu cuenta' : 'de este navegador'}. Descargá una copia del libro actual si querés conservarlo.`, label: 'Reemplazar con esta copia', danger: true })) {
    await run(async () => { if (file.size > 100 * 1024 * 1024) throw new Error('La copia supera 100 MiB.'); await service.importBackup(JSON.parse(await file.text())); ledgerState.page = 1; }, 'Copia restaurada correctamente.');
  }
});
byId('btnReset').addEventListener('click', async () => {
  if (await confirmAction({ title: '¿Borrar el libro completo?', description: `Se eliminarán las ${service.state.rows.length} cuotas y todos sus comprobantes ${inCloud() ? 'de tu cuenta' : 'de este navegador'}. Solo podrás recuperarlos con una copia de seguridad.`, label: 'Borrar libro', danger: true, phrase: 'BORRAR' })) await run(async () => { await service.reset(); ledgerState.page = 1; }, 'Libro borrado. Se creó un plan inicial de 58 cuotas.');
});
byId('btnLogin').addEventListener('click', () => {
  if (!cloudClient) return;
  access.open(cloudClient.auth.currentUser && !cloudClient.auth.currentUser.emailVerified ? 'verify' : 'login');
});
byId('btnRefresh').addEventListener('click', () => { void run(async () => { const saved = await service.repository.load(); if (!saved) throw new Error('No se encontró el libro.'); service.state = saved; }, 'Libro actualizado desde tu cuenta.'); });
byId('btnUploadLocal').addEventListener('click', async () => {
  if (await confirmAction({ title: '¿Copiar el libro local a tu cuenta?', description: 'Reemplazará las cuotas y comprobantes que ya tenés en tu cuenta. El libro local se conserva. Descargá una copia de la cuenta si querés guardar su contenido actual.', label: 'Copiar y reemplazar', danger: true })) await run(async () => service.importBackup(JSON.parse(await localService.exportBackup())), 'Libro local copiado a tu cuenta.');
});
byId('btnLogout').addEventListener('click', () => { void run(async () => { authTransition = true; try { await cloudClient.logout(); service.repository.clear(); service = localService; cloudUser = null; ledgerState.page = 1; showBook(false); } finally { authTransition = false; } }, 'Sesión cerrada.'); });
window.addEventListener('beforeunload', event => { if (busy || editorDirty() || (byId('renameDialog').open && byId('bookTitleInput').value !== service?.state.title)) { event.preventDefault(); event.returnValue = ''; } });
async function start() {
  try {
    service = new BookService(await openRepository()); await service.initialize(localStorage.getItem('libro-cuotas-v1')); localService = service;
    cloudClient = createFirebaseClient();
    if (cloudClient) {
      try { const user = await cloudClient.ready(); if (user?.emailVerified) await openCloud(user); } catch (error) { notify(`No se pudo abrir la cuenta: ${error.message}. Se abrió el libro local.`, true); byId('entryStatus').textContent = 'No se pudo abrir tu cuenta. Podés reintentar el acceso o usar el libro local.'; }
      cloudClient.subscribe(user => { if (!authTransition && inCloud() && user?.uid !== cloudUser?.uid) { service.repository.clear(); location.reload(); } });
    }
    render(service.state); accountView(); byId('app').disabled = false; byId('btnRename').disabled = false;
    byId('entryActions').disabled = false;
    byId('entryEmail').disabled = byId('entryGoogle').disabled = !cloudClient;
    if (!byId('status').classList.contains('error')) byId('entryStatus').textContent = 'Sin cuenta, el libro se guarda solo en este navegador.';
    showBook(inCloud());
    if (!byId('status').classList.contains('error')) notify(inCloud() ? 'Libro abierto. Guardado en tu cuenta.' : 'Libro abierto. Guardado solo en este dispositivo.');
  } catch (error) { notify(`No se pudo abrir el libro: ${error.message}. Los datos existentes no se reemplazaron.`, true); byId('entryStatus').textContent = 'No se pudo preparar el libro. Revisá el almacenamiento del navegador y recargá.'; byId('app').disabled = true; }
}
if (!navigator.locks) { const message = 'Abrí la app desde localhost o HTTPS en un navegador actualizado para poder editar.'; notify(message, true); byId('entryStatus').textContent = message; }
else void navigator.locks.request('libro-cuotas-editor', { ifAvailable: true }, async lock => { if (!lock) { const message = 'El libro está abierto en otra pestaña. Cerrala y recargá esta página para editar.'; notify(message, true); byId('entryStatus').textContent = message; return; } await start(); await new Promise(() => {}); }).catch(error => { notify(error.message, true); byId('entryStatus').textContent = 'No se pudo iniciar. Recargá la página.'; });
