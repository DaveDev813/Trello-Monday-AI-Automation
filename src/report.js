import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_DIFF_CHAR_LIMIT = 120_000;
const PROCESS_OUTPUT_LIMIT = 20 * 1024 * 1024;
const CODEX_CLI_CANDIDATES = [
  '/Applications/Codex.app/Contents/Resources/codex',
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex'
];

export async function generateDeploymentReport(params, options = {}) {
  const projectDir = requireText(params.projectDir, 'projectDir');
  const branchName = requireText(params.branchName, 'branchName');
  const pulseId = requireText(params.pulseId, 'pulseId');
  const environment = normalizeEnvironment(params.environment);
  const git = options.git ?? runGit;
  const projectRoot = resolveGitRoot(projectDir, git);
  const projectName = params.projectName || path.basename(projectRoot);
  const branchRef = resolveGitRef(projectRoot, branchName, git, 'branch');
  const baseRef = params.baseRef
    ? resolveGitRef(projectRoot, params.baseRef, git, 'base')
    : resolveDefaultBaseRef(projectRoot, branchRef, git);
  const mergeBase = git(projectRoot, ['merge-base', baseRef, branchRef]).trim();
  const context = collectGitContext(
    {
      baseRef,
      branchName,
      branchRef,
      diffCharLimit: options.diffCharLimit,
      environment,
      mergeBase,
      projectName,
      projectRoot,
      pulseId
    },
    git
  );
  const prompt = buildReportPrompt(context);
  const aiRunner = options.aiRunner ?? runAiCli;
  const report = normalizeAiReport(
    await aiRunner(prompt, {
      ai: options.ai,
      env: options.env ?? process.env,
      projectRoot
    })
  );

  return {
    context,
    prompt,
    report
  };
}

export function normalizeEnvironment(value) {
  const code = requireText(value, 'environment').toUpperCase();

  if (code !== 'UAT' && code !== 'LIVE') {
    throw new Error('Environment must be UAT or LIVE.');
  }

  return {
    code,
    reportLine: `Deployed in ${code === 'UAT' ? 'UAT' : 'Live'}`
  };
}

export function defaultReportPath({ branchName, date = new Date(), outputDir, projectName, pulseId }) {
  const day = formatLocalDate(date);
  const fileName = [
    day,
    sanitizePathComponent(projectName),
    sanitizePathComponent(branchName),
    sanitizePathComponent(pulseId)
  ]
    .filter(Boolean)
    .join('-');

  return path.resolve(outputDir, `${fileName}.md`);
}

export function buildReportPrompt(context) {
  return `
You are the developer who completed this work, and you are preparing a monday.com deployment update from git history and code changes.

Return only the final report in Markdown. Do not wrap it in a code fence. Do not include a preface.

Required report structure:

Environment - ${context.environment.reportLine}

Git Project - ${context.projectName}

Branch name - ${context.branchName}

Description

Change Log

How to Test

Writing rules:
- Write from my perspective as the developer who completed the work. The Description and Change Log sections must use first-person wording, such as "I updated", "I added", or "I improved".
- Write for non-technical stakeholders who need to understand what I delivered and how it affects the product, not how the code was implemented.
- Description must briefly explain what I completed and why it matters to users or stakeholders. Avoid implementation jargon.
- Change Log must be a brief human-readable list of what I changed. Do not include commit IDs, author names, commit dates, or raw git metadata.
- How to Test must be written for a normal, non-technical web user. Use plain UI actions, expected on-screen results, and simple regression checks.
- How to Test must not ask the reader to run commands, inspect code, check logs, or use developer tools.
- Use the git change summaries and code diff. Do not invent product behavior that is not supported by the evidence.
- If testing details cannot be known from the diff, provide a simple user-facing checklist and clearly label assumptions.

Report inputs:

Environment: ${context.environment.code}
Git Project: ${context.projectName}
Project directory: ${context.projectRoot}
Monday pulse ID: ${context.pulseId}
Branch name: ${context.branchName}
Resolved branch ref: ${context.branchRef}
Base ref: ${context.baseRef}
Merge base: ${context.mergeBase}

Git change summaries:
${context.commitMessages}

Git diff summary:
${context.diffStat}

Changed files:
${context.changedFiles}

Unified diff:
${context.unifiedDiff}
`.trim();
}

export function collectGitContext(context, git = runGit) {
  const range = `${context.mergeBase}..${context.branchRef}`;
  const diffCharLimit = context.diffCharLimit ?? DEFAULT_DIFF_CHAR_LIMIT;
  const commitMessages = git(context.projectRoot, [
    'log',
    '--pretty=format:- %s%n%b',
    range
  ]).trim();
  const diffStat = git(context.projectRoot, ['diff', '--stat', '--find-renames', range]).trim();
  const changedFiles = git(context.projectRoot, ['diff', '--name-status', '--find-renames', range]).trim();
  const unifiedDiff = truncateText(
    git(context.projectRoot, ['diff', '--find-renames', '--no-ext-diff', '--unified=80', range]),
    diffCharLimit
  ).trim();

  return {
    ...context,
    changedFiles: changedFiles || 'No changed files found.',
    commitMessages: commitMessages || 'No branch-only commit messages found.',
    diffStat: diffStat || 'No git diff summary found.',
    unifiedDiff: unifiedDiff || 'No unified diff found.'
  };
}

export function resolveGitRoot(projectDir, git = runGit) {
  return git(path.resolve(projectDir), ['rev-parse', '--show-toplevel']).trim();
}

export function resolveDefaultBaseRef(projectRoot, branchRef, git = runGit) {
  const originHead = tryGit(projectRoot, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], git);
  const candidates = unique([originHead, 'origin/main', 'origin/master', 'main', 'master']).filter(
    (candidate) => candidate !== branchRef
  );

  for (const candidate of candidates) {
    if (!canResolveGitRef(projectRoot, candidate, git)) {
      continue;
    }

    if (tryGit(projectRoot, ['merge-base', candidate, branchRef], git)) {
      return candidate;
    }
  }

  throw new Error('Unable to determine a base branch. Pass --base <ref> to choose one explicitly.');
}

export function resolveGitRef(projectRoot, refName, git = runGit, label = 'ref') {
  const value = requireText(refName, label);
  const candidates = unique([
    value,
    value.startsWith('origin/') ? null : `origin/${value}`,
    `refs/heads/${value}`,
    `refs/remotes/${value}`,
    value.startsWith('origin/') ? `refs/remotes/${value}` : `refs/remotes/origin/${value}`
  ]);

  for (const candidate of candidates) {
    if (canResolveGitRef(projectRoot, candidate, git)) {
      return candidate;
    }
  }

  throw new Error(`Unable to find git ${label}: ${value}`);
}

export function runGit(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
}

export async function runAiCli(prompt, options = {}) {
  const env = options.env ?? process.env;

  if (env.REPORT_AI_COMMAND) {
    return runShellAiCommand(env.REPORT_AI_COMMAND, prompt, env);
  }

  const ai = (options.ai || env.REPORT_AI_CLI || 'codex').toLowerCase();

  if (ai === 'codex' || ai === 'auto') {
    const codexCommand = resolveCliCommand('codex', env);

    if (codexCommand) {
      return runCodexCli(prompt, options.projectRoot, env, codexCommand);
    }

    if (ai === 'codex') {
      throw new Error(
        'Codex CLI was not found. Install it, set CODEX_CLI_PATH, or set REPORT_AI_COMMAND to another report command.'
      );
    }
  }

  if (ai === 'chatgpt' || ai === 'auto') {
    const chatGptCommand = resolveCliCommand('chatgpt', env);

    if (chatGptCommand) {
      return runChatGptCli(prompt, env, chatGptCommand);
    }

    if (ai === 'chatgpt') {
      throw new Error('ChatGPT CLI was not found. Install it, set CHATGPT_CLI_PATH, or set REPORT_AI_COMMAND.');
    }
  }

  throw new Error('No supported AI CLI was found. Install Codex CLI or set REPORT_AI_COMMAND.');
}

export function resolveCliCommand(command, env = process.env, options = {}) {
  const exists = options.exists ?? isExecutableFile;
  const lookup = options.lookup ?? lookupOnPath;
  const envPathKey = command === 'codex' ? 'CODEX_CLI_PATH' : command === 'chatgpt' ? 'CHATGPT_CLI_PATH' : undefined;
  const candidates = unique([
    envPathKey ? env[envPathKey] : undefined,
    lookup(command, env),
    ...(command === 'codex' ? CODEX_CLI_CANDIDATES : [])
  ]);

  return candidates.find((candidate) => exists(candidate)) || '';
}

export function normalizeAiReport(value) {
  const report = stripWrappingCodeFence(String(value ?? '')).trim();

  if (!report) {
    throw new Error('AI CLI returned an empty report.');
  }

  return report;
}

export function truncateText(value, limit = DEFAULT_DIFF_CHAR_LIMIT) {
  if (!Number.isFinite(limit) || limit <= 0 || value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n\n[Output truncated at ${limit} characters.]`;
}

function canResolveGitRef(projectRoot, refName, git) {
  return Boolean(tryGit(projectRoot, ['rev-parse', '--verify', '--quiet', `${refName}^{commit}`], git));
}

function tryGit(projectRoot, args, git) {
  try {
    return git(projectRoot, args).trim();
  } catch {
    return '';
  }
}

function runCodexCli(prompt, projectRoot, env, command) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monday-report-'));
  const outputPath = path.join(tempDir, 'report.md');
  const args = buildCodexExecArgs({
    helpText: getCodexExecHelp(command, env),
    outputPath,
    projectRoot
  });
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
    input: prompt,
    maxBuffer: PROCESS_OUTPUT_LIMIT
  });

  ensureProcessSuccess(result, 'Codex CLI');

  if (fs.existsSync(outputPath)) {
    const report = fs.readFileSync(outputPath, 'utf8');

    if (report.trim()) {
      return report;
    }
  }

  return result.stdout;
}

export function buildCodexExecArgs({ helpText = '', outputPath, projectRoot }) {
  const args = ['exec'];

  if (supportsCliOption(helpText, '--cd')) {
    args.push('--cd', projectRoot);
  }

  if (supportsCliOption(helpText, '--sandbox')) {
    args.push('--sandbox', 'read-only');
  }

  if (supportsCliOption(helpText, '--ask-for-approval')) {
    args.push('--ask-for-approval', 'never');
  }

  if (supportsCliOption(helpText, '--ephemeral')) {
    args.push('--ephemeral');
  }

  if (supportsCliOption(helpText, '--color')) {
    args.push('--color', 'never');
  }

  if (supportsCliOption(helpText, '--output-last-message')) {
    args.push('--output-last-message', outputPath);
  }

  args.push('-');
  return args;
}

function getCodexExecHelp(command, env) {
  const result = spawnSync(command, ['exec', '--help'], {
    encoding: 'utf8',
    env,
    maxBuffer: 1024 * 1024
  });

  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

function supportsCliOption(helpText, option) {
  return helpText.includes(option);
}

function runChatGptCli(prompt, env, command) {
  const result = spawnSync(command, [], {
    encoding: 'utf8',
    env,
    input: prompt,
    maxBuffer: PROCESS_OUTPUT_LIMIT
  });

  ensureProcessSuccess(result, 'ChatGPT CLI');
  return result.stdout;
}

function runShellAiCommand(command, prompt, env) {
  const result = spawnSync(command, [], {
    encoding: 'utf8',
    env,
    input: prompt,
    maxBuffer: PROCESS_OUTPUT_LIMIT,
    shell: true
  });

  ensureProcessSuccess(result, 'Configured AI command');
  return result.stdout;
}

function ensureProcessSuccess(result, label) {
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed with exit code ${result.status}.${output ? `\n${output}` : ''}`);
  }
}

function lookupOnPath(command, env) {
  const result = spawnSync('sh', ['-lc', `command -v ${quoteForShell(command)}`], {
    encoding: 'utf8',
    env
  });

  if (result.status !== 0) {
    return '';
  }

  return result.stdout.trim().split(/\r?\n/)[0] || '';
}

function isExecutableFile(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function quoteForShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function sanitizePathComponent(value) {
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function stripWrappingCodeFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);

  return match ? match[1] : trimmed;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function requireText(value, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing required ${name}.`);
  }

  return String(value).trim();
}
