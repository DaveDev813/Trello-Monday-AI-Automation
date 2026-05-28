import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDotEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

export function getDefaultDotEnvPaths(cwd = process.cwd()) {
  const cwdDotEnvPath = path.resolve(cwd, '.env');

  if (cwdDotEnvPath === projectDotEnvPath) {
    return [projectDotEnvPath];
  }

  return [cwdDotEnvPath, projectDotEnvPath];
}

export function loadDotEnv(filePath, env = process.env) {
  const filePaths = filePath === undefined ? getDefaultDotEnvPaths() : [filePath];
  let loaded = false;

  for (const candidatePath of filePaths) {
    loaded = loadDotEnvFile(candidatePath, env) || loaded;
  }

  return loaded;
}

function loadDotEnvFile(filePath, env) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const contents = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (Object.prototype.hasOwnProperty.call(env, key)) {
      continue;
    }

    env[key] = parseEnvValue(rawValue);
  }

  return true;
}

function parseEnvValue(rawValue) {
  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.replaceAll('\\n', '\n');
}
