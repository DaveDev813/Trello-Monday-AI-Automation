#!/usr/bin/env node

import { readConfig } from './config.js';
import { loadDotEnv } from './env.js';
import { parseCliArgs } from './input.js';
import { syncMondayItemsToTrello } from './index.js';
import { getTrelloMemberMe } from './trello.js';

const HELP = `
Usage:
  npm start -- --id <pulseId>
  npm start -- --ids <pulseId,pulseId>
  npm start -- <pulseId> <pulseId>
  npm start -- --file <path>
  npm run check:trello

Options:
  --id <id>        Add one monday.com pulse/item ID.
  --ids <ids>     Add comma, whitespace, or JSON-array formatted IDs.
  --file <path>   Read IDs from a JSON or plain-text file.
  --check-trello  Validate TRELLO_API_KEY and TRELLO_API_TOKEN only.
  --dry-run       Fetch monday items and resolve Trello list without creating cards.
  -h, --help      Show help.

Environment:
  MONDAY_API_TOKEN       Required.
  TRELLO_API_KEY         Required.
  TRELLO_API_TOKEN       Required.
  TRELLO_LIST_ID         Destination list ID, if known.
  TRELLO_BOARD_ID        Used when TRELLO_LIST_ID is not set.
  TRELLO_LIST_NAME       Defaults to Backlog.
  MONDAY_PULSE_IDS       Optional fallback ID list.
`;

async function main() {
  loadDotEnv();

  if (process.argv.includes('--check-trello')) {
    const config = readConfig(process.env, {
      requireMondayToken: false,
      requireTrelloTarget: false
    });
    const member = await getTrelloMemberMe(config);
    console.log(`Trello credentials are valid for ${member.fullName} (${member.username}).`);
    return;
  }

  const args = parseCliArgs(process.argv.slice(2), process.env);

  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  const config = readConfig(process.env);
  const summary = await syncMondayItemsToTrello(args.ids, config, {
    dryRun: args.dryRun
  });

  for (const result of summary.results) {
    if (result.status === 'dry-run') {
      console.log(`[dry-run] ${result.item.id}: ${result.item.name} -> ${result.item.url}`);
      continue;
    }

    console.log(
      `[created] ${result.item.id}: ${result.item.name} -> ${result.card.url || result.card.shortUrl || result.card.id}`
    );
  }

  if (summary.missingIds.length > 0) {
    console.warn(`[missing] monday.com did not return items for: ${summary.missingIds.join(', ')}`);
  }

  console.log(`Done. Trello list: ${summary.trelloListId}`);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});

function formatError(error) {
  if (error?.status === 401 && /invalid key/i.test(error.message)) {
    return `${error.message}\nCheck TRELLO_API_KEY and TRELLO_API_TOKEN. Use the Trello API key field for TRELLO_API_KEY, then open the Token link and use the generated token for TRELLO_API_TOKEN. Do not use the Power-Up Secret as the token.`;
  }

  if (error?.status === 401 && /invalid token/i.test(error.message)) {
    return `${error.message}\nCheck TRELLO_API_TOKEN. Generate it from the Token link beside the same Trello API key. Do not use the Power-Up Secret field.`;
  }

  if (error?.cause) {
    return `${error.message}\nCause: ${error.cause.message}`;
  }

  return error?.message || String(error);
}
