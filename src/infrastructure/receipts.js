import { MAX_RECEIPT_BYTES } from '../domain/plan.js';

export async function validateImage(blob) {
  if (!(blob instanceof Blob) || blob.size === 0 || blob.size > MAX_RECEIPT_BYTES) {
    throw new Error('El comprobante debe ser una imagen de hasta 1 MiB.');
  }
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const text = new TextDecoder().decode(bytes);
  const webp = text.slice(0, 4) === 'RIFF' && text.slice(8, 12) === 'WEBP';
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : null;
  if (!type || type !== blob.type) throw new Error('Contenido inválido: elegí una imagen JPEG, PNG o WebP.');
  return type;
}
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el comprobante.'));
    reader.readAsDataURL(blob);
  });
}
export async function dataUrlToBlob(data, metadata) {
  const prefix = `data:${metadata.type};base64,`;
  if (typeof data !== 'string' || !data.startsWith(prefix) || data.length > MAX_RECEIPT_BYTES * 1.4 + 100) throw new Error('Comprobante de respaldo inválido.');
  const bytes = Uint8Array.from(atob(data.slice(prefix.length)), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: metadata.type });
  if (blob.size !== metadata.size) throw new Error('El tamaño del comprobante no coincide.');
  await validateImage(blob);
  return blob;
}
