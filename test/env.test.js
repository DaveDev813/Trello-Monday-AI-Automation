import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getDefaultDotEnvPaths, loadDotEnv } from '../src/env.js';

test('getDefaultDotEnvPaths falls back to the project .env outside the repo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trello-env-'));
  const paths = getDefaultDotEnvPaths(tempDir);
  const projectDotEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

  assert.equal(paths[0], path.join(tempDir, '.env'));
  assert.equal(paths[1], projectDotEnvPath);
});

test('loadDotEnv parses explicit env files without overwriting existing values', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trello-env-'));
  const envPath = path.join(tempDir, '.env');
  const env = {
    EXISTING_VALUE: 'already-set'
  };

  fs.writeFileSync(
    envPath,
    [
      'PLAIN_VALUE=hello',
      'QUOTED_VALUE="hello world"',
      'MULTILINE_VALUE=line-one\\nline-two',
      'EXISTING_VALUE=from-file'
    ].join('\n')
  );

  assert.equal(loadDotEnv(envPath, env), true);
  assert.equal(env.PLAIN_VALUE, 'hello');
  assert.equal(env.QUOTED_VALUE, 'hello world');
  assert.equal(env.MULTILINE_VALUE, 'line-one\nline-two');
  assert.equal(env.EXISTING_VALUE, 'already-set');
});
