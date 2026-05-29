import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_REPORTS_DIR,
  formatPublishReportFileValue,
  parseMentionEmails,
  parseReportCliArgs,
  resolvePublishReportFilePath
} from '../src/report-cli.js';
import {
  buildCodexExecArgs,
  buildReportPrompt,
  generateDeploymentReport,
  normalizeAiReport,
  normalizeEnvironment,
  resolveCliCommand,
  truncateText
} from '../src/report.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parseReportCliArgs accepts the four required positional report parameters', () => {
  assert.deepEqual(parseReportCliArgs(['/apps/client-booking-portal-v2', 'feature/x', 'LIVE', '123']), {
    ai: undefined,
    branchName: 'feature/x',
    environment: 'LIVE',
    help: false,
    projectDir: '/apps/client-booking-portal-v2',
    publish: false,
    pulseId: '123',
    yes: false
  });
});

test('parseReportCliArgs resolves project folders against BASE_PROJECTS_DIR', () => {
  assert.deepEqual(
    parseReportCliArgs(['client-booking-portal-v2', 'feature/x', 'UAT', '123'], {
      BASE_PROJECTS_DIR: '/apps'
    }),
    {
      ai: undefined,
      branchName: 'feature/x',
      environment: 'UAT',
      help: false,
      projectDir: '/apps/client-booking-portal-v2',
      publish: false,
      pulseId: '123',
      yes: false
    }
  );
});

test('parseReportCliArgs accepts publish options', () => {
  assert.deepEqual(parseReportCliArgs(['--publish', '--pulse-id', '123', '--file', 'report.md', '--yes']), {
    ai: undefined,
    filePath: 'report.md',
    help: false,
    publish: true,
    pulseId: '123',
    yes: true
  });
});

test('parseReportCliArgs accepts comma-separated mention emails', () => {
  assert.deepEqual(
    parseReportCliArgs([
      '--publish',
      '--pulse-id',
      '123',
      '--file',
      'report.md',
      '--mention-emails',
      'david@example.com, jane@example.com',
      '--mentions=David@example.com'
    ]),
    {
      ai: undefined,
      filePath: 'report.md',
      help: false,
      mentionEmails: ['david@example.com', 'jane@example.com'],
      publish: true,
      pulseId: '123',
      yes: false
    }
  );
});

test('parseMentionEmails rejects invalid mention emails', () => {
  assert.throws(() => parseMentionEmails('david,dev@example.com'), /Invalid monday mention email: david/);
});

test('default report directory is anchored to the automation project', () => {
  assert.equal(DEFAULT_REPORTS_DIR, path.join(projectRoot, 'reports'));
});

test('formatPublishReportFileValue returns only filenames for reports directory files', () => {
  assert.equal(
    formatPublishReportFileValue(path.join(DEFAULT_REPORTS_DIR, 'generated-report.md')),
    'generated-report.md'
  );
});

test('resolvePublishReportFilePath resolves bare filenames from the reports directory', () => {
  assert.equal(
    resolvePublishReportFilePath('generated-report.md'),
    path.join(DEFAULT_REPORTS_DIR, 'generated-report.md')
  );
  assert.equal(
    resolvePublishReportFilePath(path.join('reports', 'generated-report.md')),
    path.join(projectRoot, 'reports', 'generated-report.md')
  );
});

test('normalizeEnvironment formats monday report environment lines', () => {
  assert.deepEqual(normalizeEnvironment('uat'), {
    code: 'UAT',
    reportLine: 'Deployed in UAT'
  });
  assert.deepEqual(normalizeEnvironment('LIVE'), {
    code: 'LIVE',
    reportLine: 'Deployed in Live'
  });
  assert.throws(() => normalizeEnvironment('dev'), /Environment must be UAT or LIVE/);
});

test('buildReportPrompt includes required report sections and git context', () => {
  const prompt = buildReportPrompt({
    baseRef: 'origin/main',
    branchName: 'feature/boards/9255430878/pulses/12102530645',
    branchRef: 'feature/boards/9255430878/pulses/12102530645',
    changedFiles: 'M\tsrc/app.js',
    commitMessages: '- Add booking confirmation',
    diffStat: 'src/app.js | 10 +++++-----',
    environment: normalizeEnvironment('UAT'),
    mergeBase: 'base123',
    projectName: 'client-booking-portal-v2',
    projectRoot: '/repo/client-booking-portal-v2',
    pulseId: '12102530645',
    unifiedDiff: 'diff --git a/src/app.js b/src/app.js'
  });

  assert.match(prompt, /Environment - Deployed in UAT/);
  assert.match(prompt, /Git Project - client-booking-portal-v2/);
  assert.match(prompt, /Branch name - feature\/boards\/9255430878\/pulses\/12102530645/);
  assert.match(prompt, /How to Test/);
  assert.match(prompt, /developer who completed this work/);
  assert.match(prompt, /Description and Change Log sections must use first-person wording/);
  assert.match(prompt, /what I delivered and how it affects the product/);
  assert.match(prompt, /Change Log must be a brief human-readable list of what I changed/);
  assert.match(prompt, /Do not include commit IDs, author names, commit dates, or raw git metadata/);
  assert.match(prompt, /How to Test must be written for a normal, non-technical web user/);
  assert.match(prompt, /- Add booking confirmation/);
});

test('generateDeploymentReport collects git context and delegates writing to the AI runner', async () => {
  const calls = [];
  const fakeGit = (cwd, args) => {
    calls.push({ args, cwd });
    const key = args.join(' ');

    if (key === 'rev-parse --show-toplevel') {
      return '/repo/client-booking-portal-v2\n';
    }

    if (key === 'rev-parse --verify --quiet feature/x^{commit}') {
      return 'branch123\n';
    }

    if (key === 'symbolic-ref --quiet --short refs/remotes/origin/HEAD') {
      return 'origin/main\n';
    }

    if (key === 'rev-parse --verify --quiet origin/main^{commit}') {
      return 'main123\n';
    }

    if (key === 'merge-base origin/main feature/x') {
      return 'base123\n';
    }

    if (key === 'log --pretty=format:- %s%n%b base123..feature/x') {
      return '- Add booking confirmation\n';
    }

    if (key === 'diff --stat --find-renames base123..feature/x') {
      return 'src/app.js | 10 +++++-----\n';
    }

    if (key === 'diff --name-status --find-renames base123..feature/x') {
      return 'M\tsrc/app.js\n';
    }

    if (key === 'diff --find-renames --no-ext-diff --unified=80 base123..feature/x') {
      return 'diff --git a/src/app.js b/src/app.js\n';
    }

    throw new Error(`Unexpected git call: ${key}`);
  };
  const aiRunner = async (prompt) => {
    assert.match(prompt, /Add booking confirmation/);
    return `
\`\`\`markdown
Environment - Deployed in UAT

Git Project - client-booking-portal-v2

Branch name - feature/x

Description

I improved the booking confirmation behavior so users get clearer feedback after booking.

Change Log

- I improved the booking confirmation flow.

How to Test

- Complete a booking and confirm the confirmation message appears.
\`\`\`
`;
  };

  const result = await generateDeploymentReport(
    {
      branchName: 'feature/x',
      environment: 'UAT',
      projectDir: '/repo/client-booking-portal-v2',
      pulseId: '123'
    },
    {
      aiRunner,
      git: fakeGit
    }
  );

  assert.equal(result.context.baseRef, 'origin/main');
  assert.equal(result.context.projectName, 'client-booking-portal-v2');
  assert.match(result.report, /^Environment - Deployed in UAT/);
  assert.ok(calls.some((call) => call.args[0] === 'diff'));
});

test('normalizeAiReport strips wrapping markdown fences', () => {
  assert.equal(normalizeAiReport('```md\nReport body\n```'), 'Report body');
});

test('resolveCliCommand uses explicit Codex CLI path before PATH lookup', () => {
  assert.equal(
    resolveCliCommand(
      'codex',
      {
        CODEX_CLI_PATH: '/custom/codex'
      },
      {
        exists: (candidate) => candidate === '/custom/codex',
        lookup: () => ''
      }
    ),
    '/custom/codex'
  );
});

test('resolveCliCommand falls back to the macOS Codex app executable', () => {
  assert.equal(
    resolveCliCommand(
      'codex',
      {},
      {
        exists: (candidate) => candidate === '/Applications/Codex.app/Contents/Resources/codex',
        lookup: () => ''
      }
    ),
    '/Applications/Codex.app/Contents/Resources/codex'
  );
});

test('buildCodexExecArgs only includes options supported by the installed Codex CLI', () => {
  const args = buildCodexExecArgs({
    helpText: `
      --cd <DIR>
      --sandbox <SANDBOX_MODE>
      --ephemeral
      --color <COLOR>
      --output-last-message <FILE>
    `,
    outputPath: '/tmp/report.md',
    projectRoot: '/repo/project'
  });

  assert.deepEqual(args, [
    'exec',
    '--cd',
    '/repo/project',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--color',
    'never',
    '--output-last-message',
    '/tmp/report.md',
    '-'
  ]);
  assert.equal(args.includes('--ask-for-approval'), false);
});

test('buildCodexExecArgs includes approval flag when Codex CLI supports it', () => {
  const args = buildCodexExecArgs({
    helpText: '--cd <DIR>\n--ask-for-approval <APPROVAL_POLICY>',
    outputPath: '/tmp/report.md',
    projectRoot: '/repo/project'
  });

  assert.deepEqual(args, ['exec', '--cd', '/repo/project', '--ask-for-approval', 'never', '-']);
});

test('truncateText appends a truncation notice', () => {
  assert.equal(truncateText('abcdef', 3), 'abc\n\n[Output truncated at 3 characters.]');
});
