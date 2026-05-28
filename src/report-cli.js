#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';

import { readConfig } from './config.js';
import { loadDotEnv } from './env.js';
import { createMondayUpdate } from './monday.js';
import { defaultReportPath, generateDeploymentReport } from './report.js';

const HELP = `
Usage:
  npm run report -- <project-dir> <branch> <UAT|LIVE> <pulseId>
  npm run report -- --project-dir <dir> --branch <branch> --env <UAT|LIVE> --pulse-id <id>
  npm run report -- --publish --pulse-id <id> --file <report.md>

Options:
  --project-dir <dir>    Git project folder to inspect. Alias: --project.
  --branch <branch>      Full branch name to report on.
  --env <UAT|LIVE>       Deployment environment.
  --pulse-id <id>        monday.com pulse/item ID.
  --base <ref>           Optional base branch/ref. Defaults to origin HEAD, origin/main, or origin/master.
  --output <path>        Where to write the generated draft Markdown report.
  --diff-char-limit <n>  Maximum unified diff characters sent to the AI CLI.
  --ai <codex|chatgpt>   AI CLI to use. Defaults to codex.
  --publish              Post a reviewed report file to the monday pulse.
  --file <path>          Reviewed Markdown report file to publish.
  --yes                  Skip the interactive publish confirmation.
  -h, --help             Show help.

Environment:
  MONDAY_API_TOKEN       Required only when publishing.
  REPORT_AI_CLI          Optional default AI CLI: codex or chatgpt.
  REPORT_AI_COMMAND      Optional custom command that reads the prompt from stdin and writes the report to stdout.
`;

async function main() {
  loadDotEnv();
  const args = parseReportCliArgs(process.argv.slice(2), process.env);

  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  if (args.publish) {
    await publishReviewedReport(args);
    return;
  }

  await writeDraftReport(args);
}

export function parseReportCliArgs(argv, env = process.env) {
  const options = {
    ai: env.REPORT_AI_CLI,
    help: false,
    publish: false,
    yes: false
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--publish') {
      options.publish = true;
      continue;
    }

    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }

    if (arg === '--project-dir' || arg === '--project' || arg === '--project-folder') {
      options.projectDir = readRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--project-dir=')) {
      options.projectDir = arg.slice('--project-dir='.length);
      continue;
    }

    if (arg.startsWith('--project=')) {
      options.projectDir = arg.slice('--project='.length);
      continue;
    }

    if (arg === '--branch') {
      options.branchName = readRequiredValue(argv, index, '--branch');
      index += 1;
      continue;
    }

    if (arg.startsWith('--branch=')) {
      options.branchName = arg.slice('--branch='.length);
      continue;
    }

    if (arg === '--env' || arg === '--environment') {
      options.environment = readRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.environment = arg.slice('--env='.length);
      continue;
    }

    if (arg === '--pulse-id' || arg === '--monday-pulse-id') {
      options.pulseId = readRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--pulse-id=')) {
      options.pulseId = arg.slice('--pulse-id='.length);
      continue;
    }

    if (arg === '--base') {
      options.baseRef = readRequiredValue(argv, index, '--base');
      index += 1;
      continue;
    }

    if (arg.startsWith('--base=')) {
      options.baseRef = arg.slice('--base='.length);
      continue;
    }

    if (arg === '--output') {
      options.outputPath = readRequiredValue(argv, index, '--output');
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.outputPath = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--file') {
      options.filePath = readRequiredValue(argv, index, '--file');
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.filePath = arg.slice('--file='.length);
      continue;
    }

    if (arg === '--ai') {
      options.ai = readRequiredValue(argv, index, '--ai');
      index += 1;
      continue;
    }

    if (arg.startsWith('--ai=')) {
      options.ai = arg.slice('--ai='.length);
      continue;
    }

    if (arg === '--diff-char-limit') {
      options.diffCharLimit = Number(readRequiredValue(argv, index, '--diff-char-limit'));
      index += 1;
      continue;
    }

    if (arg.startsWith('--diff-char-limit=')) {
      options.diffCharLimit = Number(arg.slice('--diff-char-limit='.length));
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (!options.publish) {
    options.projectDir ??= positionals[0];
    options.branchName ??= positionals[1];
    options.environment ??= positionals[2];
    options.pulseId ??= positionals[3];
  }

  validateDiffCharLimit(options.diffCharLimit);
  return options;
}

async function writeDraftReport(args) {
  requireGenerateArgs(args);
  const result = await generateDeploymentReport(
    {
      baseRef: args.baseRef,
      branchName: args.branchName,
      environment: args.environment,
      projectDir: args.projectDir,
      pulseId: args.pulseId
    },
    {
      ai: args.ai,
      diffCharLimit: args.diffCharLimit
    }
  );
  const outputPath =
    args.outputPath ||
    defaultReportPath({
      branchName: args.branchName,
      outputDir: path.resolve(process.cwd(), 'reports'),
      projectName: result.context.projectName,
      pulseId: args.pulseId
    });

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${result.report}\n`);

  console.log(`Draft report written to: ${path.resolve(outputPath)}`);
  console.log(`Base ref: ${result.context.baseRef}`);
  console.log(`Merge base: ${result.context.mergeBase}`);
  console.log('Review and edit the Markdown file, then publish it with:');
  console.log(`npm run report -- --publish --pulse-id ${args.pulseId} --file ${quoteForShell(path.resolve(outputPath))}`);
}

async function publishReviewedReport(args) {
  requirePublishArgs(args);
  const filePath = path.resolve(args.filePath);
  const body = fs.readFileSync(filePath, 'utf8').trim();

  if (!body) {
    throw new Error(`Report file is empty: ${filePath}`);
  }

  if (!(await confirmPublish(args, body, filePath))) {
    console.log('Publish cancelled.');
    return;
  }

  const config = readConfig(process.env, {
    requireTrelloCredentials: false,
    requireTrelloTarget: false
  });
  const update = await createMondayUpdate(args.pulseId, body, config);

  console.log(`[posted] monday update ${update.id} added to pulse ${args.pulseId}.`);
}

async function confirmPublish(args, body, filePath) {
  if (args.yes || !process.stdin.isTTY) {
    return true;
  }

  const preview = body.length > 2000 ? `${body.slice(0, 2000)}\n\n[Preview truncated.]` : body;
  console.log(`About to post this report to monday pulse ${args.pulseId} from ${filePath}:\n`);
  console.log(preview);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question('\nType POST to add this update to monday.com: ');
    return answer.trim() === 'POST';
  } finally {
    rl.close();
  }
}

function requireGenerateArgs(args) {
  for (const [key, label] of [
    ['projectDir', 'project folder dir'],
    ['branchName', 'git branch name'],
    ['environment', 'env'],
    ['pulseId', 'monday pulse ID']
  ]) {
    if (!args[key]) {
      throw new Error(`Missing required ${label}.`);
    }
  }
}

function requirePublishArgs(args) {
  if (!args.pulseId) {
    throw new Error('Missing required monday pulse ID.');
  }

  if (!args.filePath) {
    throw new Error('Missing required report file. Pass --file <report.md>.');
  }
}

function validateDiffCharLimit(value) {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new Error('--diff-char-limit must be a positive number.');
  }
}

function readRequiredValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function quoteForShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(formatError(error));
    process.exitCode = 1;
  });
}

function formatError(error) {
  if (error?.cause) {
    return `${error.message}\nCause: ${error.cause.message}`;
  }

  return error?.message || String(error);
}
