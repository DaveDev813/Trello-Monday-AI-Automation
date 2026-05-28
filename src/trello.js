import { requestJson } from './http.js';

export async function resolveTrelloListId(config, fetchImpl = globalThis.fetch) {
  if (config.trelloListId) {
    return config.trelloListId;
  }

  const url = trelloUrl(
    config,
    `/boards/${encodeURIComponent(config.trelloBoardId)}/lists`,
    {
      fields: 'name',
      filter: 'open'
    }
  );

  const lists = await requestJson(url, { method: 'GET' }, fetchImpl);
  const expectedName = config.trelloListName.toLowerCase();
  const list = lists.find((candidate) => candidate.name.toLowerCase() === expectedName);

  if (!list) {
    const available = lists.map((candidate) => candidate.name).join(', ') || 'none';
    throw new Error(
      `Could not find an open Trello list named "${config.trelloListName}" on board ${config.trelloBoardId}. Available lists: ${available}`
    );
  }

  return list.id;
}

export async function getTrelloMemberMe(config, fetchImpl = globalThis.fetch) {
  const url = trelloUrl(config, '/members/me', {
    fields: 'fullName,username'
  });

  return requestJson(url, { method: 'GET' }, fetchImpl);
}

export async function createTrelloCard({ listId, name, description }, config, fetchImpl = globalThis.fetch) {
  const url = trelloUrl(config, '/cards');

  return requestJson(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        desc: description,
        idList: listId,
        name,
        pos: config.trelloCardPosition
      })
    },
    fetchImpl
  );
}

function trelloUrl(config, pathname, params = {}) {
  const baseUrl = config.trelloApiBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${baseUrl}${pathname}`);

  url.searchParams.set('key', config.trelloApiKey);
  url.searchParams.set('token', config.trelloApiToken);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
