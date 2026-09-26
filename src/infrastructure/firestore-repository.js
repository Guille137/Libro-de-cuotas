import { Bytes, doc, getDocFromServer, setDoc, deleteDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { validateState } from '../domain/plan.js';
import { validateImage } from './receipts.js';

export const CLOUD_IMAGE_BYTES = 500 * 1024;
export const CLOUD_BOOK_BYTES = 200_000;

export function encodeCloudBook(state) {
  const valid = validateState(state);
  const payload = JSON.stringify(valid);
  if (new TextEncoder().encode(payload).length > CLOUD_BOOK_BYTES) throw new Error('El libro supera el límite de 200 kB de texto. Reducí las notas o exportá el historial.');
  if (valid.rows.some(r => r.receipt && r.receipt.size > CLOUD_IMAGE_BYTES)) throw new Error('Hay comprobantes de más de 500 KiB. Reemplazalos por imágenes optimizadas antes de guardar en la nube.');
  return payload;
}

// Libro personal: snapshot pequeño con revisión; imágenes binarias independientes,
// inmutables y descargadas bajo demanda. Nunca usa Cloud Storage ni Functions.
export function createFirestoreRepository(db, uid, checkSession = () => {}) {
  const bookRef = doc(db, 'users', uid, 'books', 'main');
  const fileRef = id => doc(db, 'users', uid, 'receipts', id);
  let revision = null;
  let current = null;
  const cache = new Map();
  const getIds = state => new Set((state?.rows ?? []).flatMap(r => r.receipt ? [r.receipt.id] : []));
  return {
    kind: 'cloud',
    cleanupPending: false,
    async load() {
      checkSession();
      const result = await getDocFromServer(bookRef);
      const data = result.exists() ? result.data() : null;
      const next = data ? validateState(JSON.parse(data.payload)) : null;
      revision = data?.revision ?? 0;
      current = next;
      cache.clear();
      return next;
    },
    async commit(state, { put = [] } = {}) {
      checkSession();
      if (revision === null) throw new Error('Primero abrí el libro de la cuenta.');
      // Rechazar tamaño/esquema antes de subir cualquier archivo.
      encodeCloudBook(state);
      const next = structuredClone(state);
      const uploads = [];
      for (const item of put) {
        await validateImage(item.blob);
        if (item.blob.size > CLOUD_IMAGE_BYTES) throw new Error('El comprobante supera 500 KiB.');
        const row = next.rows.find(r => r.receipt?.id === item.id);
        if (!row || row.receipt.size !== item.blob.size || row.receipt.type !== item.blob.type) throw new Error('El archivo no coincide con su cuota.');
        // Una restauración nunca sobrescribe un archivo usado por otra revisión.
        const id = crypto.randomUUID();
        row.receipt.id = id;
        uploads.push({ id, blob: item.blob, name: row.receipt.name });
      }
      const payload = encodeCloudBook(next);
      const oldIds = getIds(current);
      const nextIds = getIds(next);
      const uploadedIds = new Set(uploads.map(item => item.id));
      if ([...nextIds].some(id => !oldIds.has(id) && !uploadedIds.has(id))) throw new Error('Falta adjuntar un archivo referenciado por el libro.');
      // Cargas individuales: una importación de 58 imágenes no excede la
      // transacción de Firestore. El puntero del libro solo cambia al finalizar.
      const staged = [];
      try {
        for (const { id, blob, name } of uploads) {
          checkSession();
          // Incluir también el intento actual: su confirmación podría perderse.
          staged.push(id);
          await setDoc(fileRef(id), {
            data: Bytes.fromUint8Array(new Uint8Array(await blob.arrayBuffer())),
            type: blob.type, size: blob.size, name, createdAt: serverTimestamp(),
          });
        }
      } catch (error) {
        // Todavía no se publicó el libro: ningún cliente referencia estos IDs.
        await Promise.allSettled(staged.map(id => deleteDoc(fileRef(id))));
        throw error;
      }
      const expected = revision;
      try {
        await runTransaction(db, async transaction => {
          checkSession();
          const saved = await transaction.get(bookRef);
          const actual = saved.exists() ? saved.data().revision : 0;
          if (actual !== expected) throw new Error('Otro dispositivo cambió el libro. Tocá Actualizar desde la nube antes de volver a editar.');
          transaction.set(bookRef, { payload, revision: expected + 1, updatedAt: serverTimestamp() });
        });
      } catch (error) {
        // La respuesta del commit puede perderse aunque se haya aplicado.
        // Reconciliar con servidor antes de considerar fallida la operación.
        const saved = await getDocFromServer(bookRef).catch(() => null);
        if (!saved?.exists() || saved.data().revision !== expected + 1 || saved.data().payload !== payload) {
          if (saved) {
            // Solo limpiar con confirmación de servidor de que no están en uso.
            const referenced = saved.exists() ? getIds(validateState(JSON.parse(saved.data().payload))) : new Set();
            await Promise.allSettled(staged.filter(id => !referenced.has(id)).map(id => deleteDoc(fileRef(id))));
          }
          throw error;
        }
      }
      revision = expected + 1;
      current = next;
      for (const item of uploads) cache.set(item.id, item.blob);
      // Borrados posteriores al commit; su fallo no revierte un libro confirmado.
      const removed = [...oldIds].filter(id => !nextIds.has(id));
      const cleanup = await Promise.allSettled(removed.map(id => deleteDoc(fileRef(id))));
      this.cleanupPending = cleanup.some(result => result.status === 'rejected');
      for (const id of removed) cache.delete(id);
      return next;
    },
    async readReceipt(id) {
      checkSession();
      if (!getIds(current).has(id)) throw new Error('El comprobante no pertenece al libro abierto.');
      if (cache.has(id)) return cache.get(id);
      const result = await getDocFromServer(fileRef(id));
      if (!result.exists()) throw new Error('No se encontró el comprobante en la nube.');
      const data = result.data();
      const metadata = current.rows.find(r => r.receipt?.id === id).receipt;
      const blob = new Blob([data.data.toUint8Array()], { type: data.type });
      if (data.size !== blob.size || blob.size !== metadata.size || data.type !== metadata.type || blob.size > CLOUD_IMAGE_BYTES) throw new Error('Comprobante inconsistente.');
      await validateImage(blob);
      cache.set(id, blob);
      return blob;
    },
    async snapshot() {
      checkSession();
      // Copia coherente del libro cargado; no mezclar revisiones de otro dispositivo.
      const state = structuredClone(current);
      const receipts = [];
      for (const id of getIds(state)) receipts.push({ id, blob: await this.readReceipt(id) });
      return { state, receipts };
    },
    clear() { cache.clear(); current = null; revision = null; },
  };
}
