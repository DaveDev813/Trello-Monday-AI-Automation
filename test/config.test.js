import assert from 'node:assert/strict';
import test from 'node:test';

import { readConfig } from '../src/config.js';

test('readConfig supports monday-only configuration for report publishing', () => {
  const config = readConfig(
    {
      MONDAY_API_TOKEN: 'monday-token',
      TRELLO_API_KEY: '',
      TRELLO_API_TOKEN: ''
    },
    {
      requireTrelloCredentials: false,
      requireTrelloTarget: false
    }
  );

  assert.equal(config.mondayApiToken, 'monday-token');
  assert.equal(config.trelloApiKey, undefined);
  assert.equal(config.trelloApiToken, undefined);
});
