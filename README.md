# monday.com to Trello Backlog Sync

Create Trello cards in your backlog list from monday.com pulse/item IDs.

The app reads each monday item by ID, then creates a Trello card where:

- card title = monday item name
- card description = monday board title, parent item title for subitems, full item URL, domainless URL path, then the monday item description when present

## Setup

Requires Node.js 24 or newer and npm 11 or newer.

1. Copy `.env.example` to `.env`.
2. Fill in your credentials:

```sh
cp .env.example .env
```

Required values:

- `MONDAY_API_TOKEN`
- `TRELLO_API_KEY`
- `TRELLO_API_TOKEN`
- either `TRELLO_LIST_ID`, or `TRELLO_BOARD_ID` with `TRELLO_LIST_NAME=Backlog`

`MONDAY_API_VERSION` defaults to `2026-04`, which supports the monday item `url` and `description` fields.

For Trello, use the **API key** field as `TRELLO_API_KEY`. Do not use the Trello Power-Up **Secret** as `TRELLO_API_TOKEN`. Open the **Token** link on the same API key page, click **Allow**, and use the generated token value as `TRELLO_API_TOKEN`.

## Run

Single pulse/item ID:

```sh
npm start -- --id 1234567890
```

Multiple IDs:

```sh
npm start -- --ids 1234567890,9876543210
```

You can also pass IDs as positionals:

```sh
npm start -- 1234567890 9876543210
```

Or put IDs in `.env`:

```env
MONDAY_PULSE_IDS=1234567890,9876543210
```

Then run:

```sh
npm start
```

## Input File

The `--file` option accepts:

- a JSON array, like `[1234567890, 9876543210]`
- a JSON object with `ids`, `pulseIds`, or `itemIds`
- plain text IDs separated by commas or whitespace

```sh
npm start -- --file pulses.json
```

## Dry Run

Dry run fetches monday items and resolves the Trello list, but does not create cards:

```sh
npm start -- --ids 1234567890,9876543210 --dry-run
```

## Check Trello Credentials

```sh
npm run check:trello
```

If this fails with `invalid key`, confirm that `TRELLO_API_TOKEN` is the generated token from the **Token** authorization link, not the Power-Up **Secret** field.

## Generate a monday Deployment Report

Generate a reviewed monday pulse update from a git project folder, branch, environment, and pulse ID:

```sh
npm run report -- /path/to/client-booking-portal-v2 feature/boards/9255430878/pulses/12102530645 UAT 12102530645
```

If your projects live under one shared folder, set `BASE_PROJECTS_DIR` in `.env`:

```env
BASE_PROJECTS_DIR=/path/to/projects
```

Then pass only the project folder name:

```sh
npm run report -- client-booking-portal-v2 feature/boards/9255430878/pulses/12102530645 UAT 12102530645
```

Equivalent named options:

```sh
npm run report -- --project-dir /path/to/client-booking-portal-v2 --branch feature/boards/9255430878/pulses/12102530645 --env UAT --pulse-id 12102530645
```

The command writes a Markdown draft under `reports/` and does **not** post to monday.com. Review and edit the file first. Then publish the reviewed version:

```sh
npm run report -- --publish --pulse-id 12102530645 --file reports/<generated-report>.md
```

Publishing requires only `MONDAY_API_TOKEN`. Trello credentials are not required for reports.

Report generation uses Codex CLI by default:

```sh
codex exec --cd <project-dir> --sandbox read-only --ask-for-approval never
```

On macOS, the report command also checks the Codex desktop app executable at `/Applications/Codex.app/Contents/Resources/codex`. If your install is somewhere else, set:

```sh
CODEX_CLI_PATH="/path/to/codex"
```

To use another CLI that reads a prompt from stdin and writes the report to stdout, set:

```sh
REPORT_AI_COMMAND="your-chatgpt-command"
```

The report includes:

- `Environment - Deployed in UAT` or `Environment - Deployed in Live`
- `Git Project`
- `Branch name`
- `Description`
- `Change Log` with brief descriptions of what changed, without commit IDs or author names
- `How to Test` written as plain web-user steps for non-technical reviewers

By default the branch is compared with `origin/HEAD`, `origin/main`, `origin/master`, `main`, or `master`, whichever exists first. Use `--base <ref>` when a different base branch is needed.

## Notes

- monday.com calls use `https://api.monday.com/v2`.
- Trello calls use `https://api.trello.com/1`.
- The destination Trello list is resolved once per run.
