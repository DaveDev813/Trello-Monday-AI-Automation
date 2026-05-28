import assert from 'node:assert/strict';
import test from 'node:test';

import { syncMondayItemsToTrello } from '../src/index.js';

const config = {
  mondayApiToken: 'monday-token',
  mondayApiUrl: 'https://api.monday.test/v2',
  mondayApiVersion: '2026-04',
  trelloApiBaseUrl: 'https://api.trello.test/1/',
  trelloApiKey: 'trello-key',
  trelloApiToken: 'trello-token',
  trelloBoardId: 'board-123',
  trelloCardPosition: 'bottom',
  trelloListName: 'Backlog'
};

test('syncMondayItemsToTrello creates one Trello card per monday item', async () => {
  const createdCards = [];

  const fetch = async (url, options) => {
    const parsedUrl = new URL(url);

    if (url === config.mondayApiUrl) {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, config.mondayApiToken);
      assert.equal(options.headers['API-Version'], config.mondayApiVersion);
      assert.deepEqual(JSON.parse(options.body).variables.ids, ['123', '456']);

      return jsonResponse({
        data: {
          items: [
            {
              id: '123',
              name: 'First pulse',
              board: {
                id: '1',
                name: 'Marketing Requests'
              },
              parent_item: {
                id: '999',
                name: 'Parent campaign'
              },
              description: {
                blocks: [
                  {
                    id: 'block-1',
                    content: {
                      deltaFormat: [
                        {
                          insert: {
                            text: 'First pulse description'
                          }
                        }
                      ]
                    }
                  }
                ]
              },
              url: 'https://example.monday.com/boards/1/pulses/123'
            },
            {
              id: '456',
              name: 'Second pulse',
              board: {
                id: '1',
                name: 'Marketing Requests'
              },
              parent_item: null,
              description: {
                blocks: []
              },
              url: 'https://example.monday.com/boards/1/pulses/456'
            }
          ]
        }
      });
    }

    if (parsedUrl.pathname === '/1/boards/board-123/lists') {
      assert.equal(parsedUrl.searchParams.get('key'), config.trelloApiKey);
      assert.equal(parsedUrl.searchParams.get('token'), config.trelloApiToken);

      return jsonResponse([
        {
          id: 'list-1',
          name: 'Done'
        },
        {
          id: 'list-2',
          name: 'Backlog'
        }
      ]);
    }

    if (parsedUrl.pathname === '/1/cards') {
      const body = JSON.parse(options.body);
      createdCards.push(body);

      return jsonResponse({
        id: `card-${createdCards.length}`,
        url: `https://trello.example/cards/${createdCards.length}`
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const summary = await syncMondayItemsToTrello(['123', '456'], config, { fetch });

  assert.equal(summary.trelloListId, 'list-2');
  assert.deepEqual(summary.missingIds, []);
  assert.deepEqual(
    createdCards.map((card) => ({
      desc: card.desc,
      idList: card.idList,
      name: card.name,
      pos: card.pos
    })),
    [
      {
        desc: 'Marketing Requests\nParent: Parent campaign\nhttps://example.monday.com/boards/1/pulses/123\nboards/1/pulses/123\n\nFirst pulse description',
        idList: 'list-2',
        name: 'First pulse',
        pos: 'bottom'
      },
      {
        desc: 'Marketing Requests\nhttps://example.monday.com/boards/1/pulses/456\nboards/1/pulses/456',
        idList: 'list-2',
        name: 'Second pulse',
        pos: 'bottom'
      }
    ]
  );
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json'
    },
    status
  });
}
