import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeItemIds, parseCliArgs, parseIdList } from '../src/input.js';

test('parseIdList accepts comma and whitespace separated IDs', () => {
  assert.deepEqual(parseIdList('123, 456\n789'), ['123', '456', '789']);
});

test('parseIdList accepts JSON arrays', () => {
  assert.deepEqual(parseIdList('[123, "456"]'), ['123', '456']);
});

test('normalizeItemIds removes duplicates while preserving order', () => {
  assert.deepEqual(normalizeItemIds(['123', '456', '123']), ['123', '456']);
});

test('parseCliArgs accepts options, positionals, and dry run', () => {
  assert.deepEqual(parseCliArgs(['--ids', '123,456', '--dry-run', '789']), {
    dryRun: true,
    help: false,
    ids: ['123', '456', '789']
  });
});

test('parseCliArgs falls back to MONDAY_PULSE_IDS', () => {
  assert.deepEqual(parseCliArgs([], { MONDAY_PULSE_IDS: '123 456' }).ids, ['123', '456']);
});
