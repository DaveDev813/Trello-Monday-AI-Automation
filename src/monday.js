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

const CREATE_UPDATE_WITH_MENTIONS_MUTATION = `
  mutation CreateMondayUpdate($itemId: ID!, $body: String!, $mentionsList: [UpdateMention!]) {
    create_update(item_id: $itemId, body: $body, mentions_list: $mentionsList) {
      id
    }
  }
`;

const USERS_BY_EMAILS_QUERY = `
  query MondayUsersByEmails($emails: [String!]!) {
    users(emails: $emails) {
      id
      name
      email
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

export async function fetchMondayUsersByEmails(emails, config, fetchImpl = globalThis.fetch) {
  const uniqueEmails = normalizeEmailList(emails);

  if (!uniqueEmails.length) {
    return [];
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
        query: USERS_BY_EMAILS_QUERY,
        variables: {
          emails: uniqueEmails
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

  return response.data?.users ?? [];
}

export async function createMondayUpdate(itemId, body, config, fetchImpl = globalThis.fetch, options = {}) {
  if (!itemId) {
    throw new Error('Provide a monday.com pulse/item ID.');
  }

  if (!body?.trim()) {
    throw new Error('Provide a non-empty monday.com update body.');
  }

  const mentionsList = normalizeMentionsList(options.mentionsList);
  const variables = {
    body: mentionsList.length ? appendMentionLineBreak(body) : body,
    itemId: String(itemId)
  };

  if (mentionsList.length) {
    variables.mentionsList = mentionsList;
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
        query: mentionsList.length ? CREATE_UPDATE_WITH_MENTIONS_MUTATION : CREATE_UPDATE_MUTATION,
        variables
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

function normalizeEmailList(emails) {
  if (!Array.isArray(emails)) {
    throw new Error('Provide monday user emails as an array.');
  }

  const seen = new Set();
  const uniqueEmails = [];

  for (const email of emails) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedEmail || seen.has(normalizedEmail)) {
      continue;
    }

    seen.add(normalizedEmail);
    uniqueEmails.push(normalizedEmail);
  }

  return uniqueEmails;
}

function normalizeMentionsList(mentionsList) {
  if (!mentionsList) {
    return [];
  }

  if (!Array.isArray(mentionsList)) {
    throw new Error('Provide monday update mentions as an array.');
  }

  return mentionsList.map((mention) => {
    if (!mention?.id) {
      throw new Error('Each monday update mention requires an id.');
    }

    return {
      id: String(mention.id),
      type: mention.type || 'User'
    };
  });
}

function appendMentionLineBreak(body) {
  return `${body.trimEnd()}\n`;
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
