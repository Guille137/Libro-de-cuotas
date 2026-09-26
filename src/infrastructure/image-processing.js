import { detectImageType, validateImage } from './receipts.js';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const TARGET_BYTES = 500 * 1024;

// Se ejecuta en el navegador: no utiliza Functions ni servicios de pago.
export async function optimizeImage(file) {
  if (!(file instanceof Blob) || !file.size || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Elegí una imagen PNG, JPEG o WebP de hasta 15 MiB.');
  }
  const type = await detectImageType(file);
  if (!type) throw new Error('El contenido del archivo no es una imagen JPEG, PNG o WebP.');
  // Algunos celulares entregan MIME vacío, genérico o image/jpg. El contenido manda.
  const source = new Blob([file], { type });
  const bitmap = await createImageBitmap(source).catch(() => { throw new Error('No se pudo leer la imagen. Probá exportarla como JPEG o PNG.'); });
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('La imagen supera 24 megapíxeles. Recortala antes de adjuntarla.');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const originalSide = Math.max(bitmap.width, bitmap.height);
    for (const side of [2400, 2000, 1600]) {
      const scale = Math.min(1, side / originalSide);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.82, 0.74]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= TARGET_BYTES) {
          await validateImage(blob);
          const extension = blob.type === 'image/webp' ? 'webp' : 'png';
          const name = `${(file.name || 'comprobante').replace(/\.[^.]+$/, '').slice(0, 110)}.${extension}`;
          return new File([blob], name, { type: blob.type });
        }
      }
    }
    throw new Error('No se pudo reducir a 500 KiB sin bajar demasiado la calidad. Recortá los márgenes y volvé a intentarlo.');
  } finally { bitmap.close(); }
}
