import { ApiError, requestJson } from './http.js';

const ITEMS_BY_ID_QUERY = `
  query MondayItemsByIds($ids: [ID!]!) {
    items(ids: $ids) {
      id
      name
      url
      board {
        id
        name
      }
      parent_item {
        id
        name
      }
      description {
        id
        blocks {
          id
          content
        }
      }
    }
  }
`;

const CREATE_UPDATE_MUTATION = `
  mutation CreateMondayUpdate($itemId: ID!, $body: String!) {
    create_update(item_id: $itemId, body: $body) {
      id
    }
  }
`;

export async function fetchMondayItems(itemIds, config, fetchImpl = globalThis.fetch) {
  const response = await requestJson(
    config.mondayApiUrl,
    {
      method: 'POST',
      headers: {
        Authorization: config.mondayApiToken,
        'API-Version': config.mondayApiVersion,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: ITEMS_BY_ID_QUERY,
        variables: {
          ids: itemIds
        }
      })
    },
    fetchImpl
  );

  if (response.errors?.length) {
    const message = response.errors.map((error) => error.message).join('; ');
    throw new ApiError(`monday.com GraphQL error: ${message}`, {
      body: response.errors,
      url: config.mondayApiUrl
    });
  }

  const items = response.data?.items ?? [];

  for (const item of items) {
    if (!item.url) {
      throw new Error(
        `monday.com did not return a URL for item ${item.id}. Ensure MONDAY_API_VERSION is 2024-04 or newer.`
      );
    }

    item.descriptionText = extractMondayDescriptionText(item.description);
  }

  return items;
}

export async function createMondayUpdate(itemId, body, config, fetchImpl = globalThis.fetch) {
  if (!itemId) {
    throw new Error('Provide a monday.com pulse/item ID.');
  }

  if (!body?.trim()) {
    throw new Error('Provide a non-empty monday.com update body.');
  }

  const response = await requestJson(
    config.mondayApiUrl,
    {
      method: 'POST',
      headers: {
        Authorization: config.mondayApiToken,
        'API-Version': config.mondayApiVersion,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: CREATE_UPDATE_MUTATION,
        variables: {
          body,
          itemId: String(itemId)
        }
      })
    },
    fetchImpl
  );

  if (response.errors?.length) {
    const message = response.errors.map((error) => error.message).join('; ');
    throw new ApiError(`monday.com GraphQL error: ${message}`, {
      body: response.errors,
      url: config.mondayApiUrl
    });
  }

  const update = response.data?.create_update;

  if (!update?.id) {
    throw new Error('monday.com did not return a created update ID.');
  }

  return update;
}

export function extractMondayDescriptionText(description) {
  if (!description?.blocks?.length) {
    return '';
  }

  return normalizeDescriptionText(
    description.blocks
      .map((block) => extractContentText(block.content).trim())
      .filter(Boolean)
      .join('\n\n')
  );
}

function extractContentText(content) {
  if (content === undefined || content === null) {
    return '';
  }

  if (typeof content === 'string') {
    return extractStringContent(content);
  }

  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }

  if (Array.isArray(content)) {
    return content.map(extractContentText).join('');
  }

  if (typeof content === 'object') {
    if (Array.isArray(content.deltaFormat)) {
      return content.deltaFormat.map(extractDeltaOperationText).join('');
    }

    if (content.insert !== undefined) {
      return extractInsertText(content.insert);
    }

    if (typeof content.text === 'string') {
      return content.text;
    }

    const nestedContent = content.content ?? content.children ?? content.blocks ?? content.operations;

    if (nestedContent !== undefined) {
      return extractContentText(nestedContent);
    }
  }

  return '';
}

function extractStringContent(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return extractContentText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function extractDeltaOperationText(operation) {
  if (operation?.insert === undefined) {
    return '';
  }

  return extractInsertText(operation.insert);
}

function extractInsertText(insert) {
  if (typeof insert === 'string') {
    return insert;
  }

  if (insert && typeof insert === 'object' && typeof insert.text === 'string') {
    return insert.text;
  }

  return '';
}

function normalizeDescriptionText(value) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
