import fs from 'node:fs';
import path from 'node:path';

export function normalizeItemIds(input) {
  const rawIds = Array.isArray(input) ? input.flatMap(parseIdList) : parseIdList(input);
  const uniqueIds = [];
  const seen = new Set();

  for (const rawId of rawIds) {
    const id = String(rawId).trim();

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    uniqueIds.push(id);
  }

  return uniqueIds;
}

export function parseIdList(input) {
  if (input === undefined || input === null || input === '') {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap(parseIdList);
  }

  if (typeof input === 'number' || typeof input === 'bigint') {
    return [String(input)];
  }

  if (typeof input !== 'string') {
    throw new TypeError('Pulse IDs must be provided as a string, number, or array.');
  }

  const value = input.trim();

  if (!value) {
    return [];
  }

  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      throw new TypeError('JSON pulse ID input must be an array.');
    }

    return parsed.flatMap(parseIdList);
  }

  return value.split(/[\s,]+/).filter(Boolean);
}

export function readIdsFromFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const contents = fs.readFileSync(absolutePath, 'utf8').trim();

  if (!contents) {
    return [];
  }

  try {
    const parsed = JSON.parse(contents);

    if (Array.isArray(parsed)) {
      return normalizeItemIds(parsed);
    }

    if (parsed && typeof parsed === 'object') {
      const ids = parsed.ids ?? parsed.pulseIds ?? parsed.itemIds;

      if (ids === undefined) {
        throw new TypeError('JSON object input must contain ids, pulseIds, or itemIds.');
      }

      return normalizeItemIds(ids);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return normalizeItemIds(contents);
}

export function parseCliArgs(argv, env = process.env) {
  const options = {
    dryRun: false,
    help: false,
    ids: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--id') {
      options.ids.push(...normalizeItemIds(readRequiredValue(argv, index, '--id')));
      index += 1;
      continue;
    }

    if (arg.startsWith('--id=')) {
      options.ids.push(...normalizeItemIds(arg.slice('--id='.length)));
      continue;
    }

    if (arg === '--ids') {
      options.ids.push(...normalizeItemIds(readRequiredValue(argv, index, '--ids')));
      index += 1;
      continue;
    }

    if (arg.startsWith('--ids=')) {
      options.ids.push(...normalizeItemIds(arg.slice('--ids='.length)));
      continue;
    }

    if (arg === '--file') {
      options.ids.push(...readIdsFromFile(readRequiredValue(argv, index, '--file')));
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.ids.push(...readIdsFromFile(arg.slice('--file='.length)));
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.ids.push(...normalizeItemIds(arg));
  }

  if (options.ids.length === 0 && env.MONDAY_PULSE_IDS) {
    options.ids.push(...normalizeItemIds(env.MONDAY_PULSE_IDS));
  }

  options.ids = normalizeItemIds(options.ids);
  return options;
}

function readRequiredValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}
