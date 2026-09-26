import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRows, dateLabel } from '../src/ui/ledger-model.js';
import { defaultState } from '../src/domain/plan.js';
import { BookService } from '../src/application/book-service.js';

test('lista paginada y filtro de vencidas sin perder el número original', () => {
  const state = defaultState('2026-01-01');
  state.rows[0].paid = true; state.rows[0].paidDate = '2026-01-01';
  const result = selectRows(state, { filter: 'overdue', today: '2026-03-15' });
  assert.deepEqual(result.rows.map(item => item.number), [2, 3]);
  assert.equal(result.counts.pending, 57);
  assert.equal(selectRows(state, { page: 99 }).page, 5);
  assert.equal(selectRows(state).rows.length, 12);
});
test('búsqueda por nota sin acentos, fecha y cuota', () => {
  const state = defaultState('2026-01-01'); state.rows[4].note = 'Transferencia Martín';
  assert.equal(selectRows(state, { query: 'martin' }).rows[0].number, 5);
  assert.equal(selectRows(state, { query: '2026-02-01' }).rows[0].number, 2);
  assert.deepEqual(selectRows(state, { query: '1' }).rows.map(item => item.number), [1]);
  assert.deepEqual(selectRows(state, { query: 'cuota 12' }).rows.map(item => item.number), [12]);
  assert.equal(selectRows(state, { query: 'no-existe', page: 4 }).page, 1);
  assert.match(dateLabel('2026-01-31'), /31/);
});
test('guardar detalle cambia monto, pago, fecha y nota en un solo commit', async () => {
  let stored = defaultState(); let writes = 0;
  const repo = { async load() { return stored; }, async commit(next) { writes++; stored = next; } };
  const service = new BookService(repo); await service.initialize();
  const id = stored.rows[0].id;
  await service.updateDetails(id, { amount: '12.35', paid: true, paidDate: '2026-09-25', note: 'Transferencia' });
  assert.equal(writes, 1); assert.equal(service.state.rows[0].amountCents, 1235); assert.equal(service.state.rows[0].paid, true);
  await assert.rejects(service.updateDetails(id, { amount: '99', paid: true, paidDate: '', note: 'Inválida' }));
  assert.equal(writes, 1); assert.equal(service.state.rows[0].amountCents, 1235);
  await service.updateDetails(id, { amount: '12.35', paid: false, paidDate: '', note: 'Corrección' });
  assert.equal(service.state.rows[0].paidDate, '');
});
