import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, validateState, validateBookTitle, DEFAULT_BOOK_TITLE } from '../src/domain/plan.js';
import { BookService } from '../src/application/book-service.js';

test('título validado y compatible con libros anteriores sin título', () => {
  const old = defaultState(); delete old.title;
  assert.equal(validateState(old).title, DEFAULT_BOOK_TITLE);
  assert.equal(validateBookTitle('  Mi departamento  '), 'Mi departamento');
  assert.equal(validateBookTitle('A'.repeat(80)).length, 80);
  for (const invalid of ['', '   ', null, 123, 'A'.repeat(81), 'Una\notra']) assert.throws(() => validateBookTitle(invalid));
  assert.equal(validateBookTitle('<img src=x>'), '<img src=x>');
});

test('renombrar conserva montos personalizados y el título sobrevive a calendario y respaldo', async () => {
  let stored = defaultState(); stored.rows[0].amountCents = 1234;
  const repo = { async load() { return structuredClone(stored); }, async commit(next) { stored = structuredClone(next); }, async snapshot() { return { state: stored, receipts: [] }; } };
  const service = new BookService(repo); await service.initialize();
  const rows = structuredClone(service.state.rows);
  await service.rename('Mi departamento');
  assert.deepEqual(service.state.rows, rows);
  await service.regenerate({ ...service.state.cfg, totalMonths: 59 });
  assert.equal(service.state.title, 'Mi departamento');
  const backup = JSON.parse(await service.exportBackup());
  await service.reset(); assert.equal(service.state.title, DEFAULT_BOOK_TITLE);
  await service.importBackup(backup);
  assert.equal(service.state.title, 'Mi departamento');
  assert.equal(service.state.rows.length, 59);
});

test('fallo al guardar título no cambia el estado en memoria', async () => {
  const service = new BookService({ async load() { return defaultState(); }, async commit() { throw new Error('Sin espacio'); } });
  await service.initialize();
  await assert.rejects(service.rename('No guardado'), /Sin espacio/);
  assert.equal(service.state.title, DEFAULT_BOOK_TITLE);
});
