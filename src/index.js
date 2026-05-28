import { normalizeItemIds } from './input.js';
import { fetchMondayItems } from './monday.js';
import { createTrelloCard, resolveTrelloListId } from './trello.js';

export async function syncMondayItemsToTrello(itemIds, config, options = {}) {
  const ids = normalizeItemIds(itemIds);

  if (ids.length === 0) {
    throw new Error('Provide at least one monday.com pulse/item ID.');
  }

  const mondayItems = await fetchMondayItems(ids, config, options.fetch);
  const itemsById = new Map(mondayItems.map((item) => [String(item.id), item]));
  const orderedItems = ids.map((id) => itemsById.get(id)).filter(Boolean);
  const missingIds = ids.filter((id) => !itemsById.has(id));
  const trelloListId = await resolveTrelloListId(config, options.fetch);
  const results = [];

  for (const item of orderedItems) {
    if (options.dryRun) {
      results.push({
        card: null,
        item,
        status: 'dry-run'
      });
      continue;
    }

    const card = await createTrelloCard(
      {
        description: buildTrelloDescription(item),
        listId: trelloListId,
        name: item.name
      },
      config,
      options.fetch
    );

    results.push({
      card,
      item,
      status: 'created'
    });
  }

  return {
    missingIds,
    results,
    trelloListId
  };
}

function buildTrelloDescription(item) {
  const urlLines = [
    item.board?.name,
    formatParentTitle(item.parent_item),
    item.url,
    extractUrlPath(item.url)
  ]
    .filter(Boolean)
    .join('\n');

  return [urlLines, item.descriptionText].filter(Boolean).join('\n\n');
}

function formatParentTitle(parentItem) {
  if (!parentItem?.name) {
    return '';
  }

  return `Parent: ${parentItem.name}`;
}

function extractUrlPath(value) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}
