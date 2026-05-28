import { loadDotEnv } from './env.js';

export function readConfig(env = process.env, options = {}) {
  loadDotEnv(undefined, env);

  const requireMondayToken = options.requireMondayToken ?? true;
  const requireTrelloCredentials = options.requireTrelloCredentials ?? true;
  const requireTrelloTarget = options.requireTrelloTarget ?? true;
  const config = {
    mondayApiToken: requireMondayToken ? requiredEnv(env, 'MONDAY_API_TOKEN') : emptyToUndefined(env.MONDAY_API_TOKEN),
    mondayApiUrl: env.MONDAY_API_URL || 'https://api.monday.com/v2',
    mondayApiVersion: env.MONDAY_API_VERSION || '2026-04',
    trelloApiKey: requireTrelloCredentials ? requiredEnv(env, 'TRELLO_API_KEY') : emptyToUndefined(env.TRELLO_API_KEY),
    trelloApiToken: requireTrelloCredentials
      ? requiredEnv(env, 'TRELLO_API_TOKEN')
      : emptyToUndefined(env.TRELLO_API_TOKEN),
    trelloApiBaseUrl: env.TRELLO_API_BASE_URL || 'https://api.trello.com/1',
    trelloBoardId: emptyToUndefined(env.TRELLO_BOARD_ID),
    trelloCardPosition: env.TRELLO_CARD_POSITION || 'bottom',
    trelloListId: emptyToUndefined(env.TRELLO_LIST_ID),
    trelloListName: env.TRELLO_LIST_NAME || 'Backlog'
  };

  if (requireTrelloTarget && !config.trelloListId && !config.trelloBoardId) {
    throw new Error('Set TRELLO_LIST_ID, or set TRELLO_BOARD_ID so the Backlog list can be found.');
  }

  return config;
}

function requiredEnv(env, key) {
  const value = emptyToUndefined(env[key]);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function emptyToUndefined(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }

  return String(value).trim();
}
