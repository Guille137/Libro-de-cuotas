import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, validateImage } from '../src/infrastructure/receipts.js';

test('WebP se reconoce por offsets de bytes aunque el tamaño RIFF forme UTF-8 multibyte', async () => {
  for (const size of [[0xc2, 0x80, 0, 0], [0xe1, 0x80, 0x80, 0], [0xff, 0xff, 0, 0]]) {
    const blob = new Blob([new Uint8Array([82,73,70,70,...size,87,69,66,80,86,80,56,32])], { type:'image/webp' });
    assert.equal(await validateImage(blob), 'image/webp');
  }
});

test('detección de entrada reconoce JPEG sin depender del MIME declarado', async () => {
  for (const type of ['', 'image/jpg', 'application/octet-stream', 'image/jpeg']) {
    const blob = new Blob([new Uint8Array([255,216,255,224,0,16,74,70,73,70])], {type});
    assert.equal(await detectImageType(blob),'image/jpeg');
    if (type !== 'image/jpeg') await assert.rejects(validateImage(blob), /Contenido inválido/);
  }
});

test('no se acepta SVG renombrado a JPEG ni una cabecera truncada', async () => {
  assert.equal(await detectImageType(new Blob(['<svg></svg>'], {type:'image/jpeg'})),null);
  assert.equal(await detectImageType(new Blob([new Uint8Array([255,216])])),null);
  assert.equal(await detectImageType(new Blob(['RIFFxxxxWEB'])),null);
});
