const DATABASE = 'libro-cuotas-v2';
const KEY = 'active';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el guardado.'));
    transaction.onerror = () => reject(transaction.error);
  });
}
// Puerto de persistencia: load(), commit(state, changes), readReceipt(id), snapshot().
// Cuotas y archivos se actualizan dentro de una única transacción.
export async function openRepository() {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('state');
    request.result.createObjectStore('receipts');
  };
  const db = await requestResult(request);
  db.onversionchange = () => db.close();
  return {
    async load() {
      return requestResult(db.transaction('state').objectStore('state').get(KEY));
    },
    async commit(state, { put = [], remove = [], replace = false } = {}) {
      const tx = db.transaction(['state', 'receipts'], 'readwrite');
      const done = transactionDone(tx);
      try {
        const receipts = tx.objectStore('receipts');
        if (replace) receipts.clear();
        for (const id of remove) receipts.delete(id);
        for (const { id, blob } of put) receipts.put(blob, id);
        tx.objectStore('state').put(state, KEY);
        await done;
      } catch (error) {
        // También abortar errores síncronos: no dejar archivos parcialmente modificados.
        try { tx.abort(); } catch { /* La transacción puede haber terminado. */ }
        await done.catch(() => {});
        throw error;
      }
    },
    async readReceipt(id) {
      return requestResult(db.transaction('receipts').objectStore('receipts').get(id));
    },
    async snapshot() {
      const tx = db.transaction(['state', 'receipts']);
      const state = requestResult(tx.objectStore('state').get(KEY));
      const keys = requestResult(tx.objectStore('receipts').getAllKeys());
      const blobs = requestResult(tx.objectStore('receipts').getAll());
      const [value, ids, files] = await Promise.all([state, keys, blobs]);
      return { state: value, receipts: ids.map((id, i) => ({ id, blob: files[i] })) };
    },
  };
}
