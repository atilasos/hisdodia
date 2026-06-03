import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayInventory, formatStoryId, isLeapDay } from '../../src/recovery/calendar.mjs';

describe('calendar inventory', () => {
  it('builds one entry for each day in a leap-year story calendar', () => {
    const days = buildDayInventory();

    assert.equal(days.length, 366);
    assert.deepEqual(days[0], { month: 1, day: 1, id: '01-01' });
    assert.deepEqual(days[365], { month: 12, day: 31, id: '12-31' });
  });

  it('formats stable story ids', () => {
    assert.equal(formatStoryId(1, 2), '01-02');
    assert.equal(formatStoryId(10, 31), '10-31');
  });

  it('marks 29 February explicitly', () => {
    assert.equal(isLeapDay({ month: 2, day: 29 }), true);
    assert.equal(isLeapDay({ month: 3, day: 1 }), false);
  });
});
