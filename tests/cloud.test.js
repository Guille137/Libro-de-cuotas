import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCloudBook } from '../src/infrastructure/firestore-repository.js';
import { defaultState, buildRows } from '../src/domain/plan.js';

test('libro personal cabe holgadamente y texto excesivo se rechaza antes de subir', () => {
  const state = defaultState();
  assert.ok(new TextEncoder().encode(encodeCloudBook(state)).length < 20000);
  state.cfg.totalMonths = 600;
  state.rows = buildRows(state.cfg);
  for (const row of state.rows) row.note = 'á'.repeat(1000);
  assert.throws(() => encodeCloudBook(state), /200 kB/);
});
test('imágenes antiguas mayores de 500 KiB requieren optimización explícita', () => {
  const state = defaultState();
  state.rows[0].receipt = { id: crypto.randomUUID(), name: 'vieja.png', type: 'image/png', size: 600000 };
  assert.throws(() => encodeCloudBook(state), /500 KiB/);
});
