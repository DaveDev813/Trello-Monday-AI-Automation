import assert from 'node:assert/strict';
import test from 'node:test';

import { createMondayUpdate, extractMondayDescriptionText } from '../src/monday.js';

test('extractMondayDescriptionText reads delta-format description blocks', () => {
  const description = {
    blocks: [
      {
        content: {
          deltaFormat: [
            {
              insert: {
                text: 'First line'
              }
            },
            {
              insert: {
                text: '\nSecond line'
              }
            }
          ]
        }
      },
      {
        content: JSON.stringify({
          deltaFormat: [
            {
              insert: 'Another block'
            }
          ]
        })
      }
    ]
  };

  assert.equal(extractMondayDescriptionText(description), 'First line\nSecond line\n\nAnother block');
});

test('extractMondayDescriptionText returns blank text for empty descriptions', () => {
  assert.equal(extractMondayDescriptionText({ blocks: [] }), '');
  assert.equal(extractMondayDescriptionText(null), '');
});

test('createMondayUpdate posts reviewed report text to a monday pulse', async () => {
  const config = {
    mondayApiToken: 'monday-token',
    mondayApiUrl: 'https://api.monday.test/v2',
    mondayApiVersion: '2026-04'
  };
  const fetch = async (url, options) => {
    assert.equal(url, config.mondayApiUrl);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, config.mondayApiToken);
    assert.equal(options.headers['API-Version'], config.mondayApiVersion);

    const body = JSON.parse(options.body);
    assert.match(body.query, /create_update/);
    assert.deepEqual(body.variables, {
      body: 'Reviewed report',
      itemId: '123'
    });

    return new Response(
      JSON.stringify({
        data: {
          create_update: {
            body: 'Reviewed report',
            created_at: '2026-05-28T00:00:00Z',
            id: 'update-1'
          }
        }
      })
    );
  };

  const update = await createMondayUpdate('123', 'Reviewed report', config, fetch);

  assert.equal(update.id, 'update-1');
});
