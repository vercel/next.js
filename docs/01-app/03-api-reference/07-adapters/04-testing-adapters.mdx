---
title: Testing Adapters
description: Validate adapters with the Next.js compatibility test harness and custom lifecycle scripts.
---

Next.js provides a test harness for validating adapters. Running the end-to-end tests for deployment.

Example GitHub Actions workflow:

```yaml filename=".github/workflows/test-e2e-deploy.yml"
name: test-e2e-deploy

on:
  workflow_dispatch:
    inputs:
      nextjsRef:
        description: 'Next.js repo ref (branch/tag/SHA)'
        default: 'canary'
        type: string
  # schedule:
  #   - cron: '0 2 * * *'

jobs:
  build:
    name: Build Next.js + adapter
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          path: adapter

      - uses: actions/checkout@v4
        with:
          repository: vercel/next.js
          ref: ${{ inputs.nextjsRef || 'canary' }}
          path: nextjs
          fetch-depth: 25

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Setup pnpm
        run: npm i -g corepack@0.31 && corepack enable

      - name: Install & build Next.js
        working-directory: nextjs
        run: pnpm install && pnpm build && pnpm install

      - name: Install Playwright
        working-directory: nextjs
        run: pnpm playwright install --with-deps chromium

      - name: Build adapter
        working-directory: adapter
        run: pnpm install && pnpm build

      - uses: actions/cache/save@v4
        with:
          path: |
            nextjs
            adapter
            ~/.cache/ms-playwright
          key: build-${{ github.sha }}-${{ github.run_id }}

  test:
    name: Tests (${{ matrix.group }})
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        group:
          [
            1/16,
            2/16,
            3/16,
            4/16,
            5/16,
            6/16,
            7/16,
            8/16,
            9/16,
            10/16,
            11/16,
            12/16,
            13/16,
            14/16,
            15/16,
            16/16,
          ]
    steps:
      - uses: actions/cache/restore@v4
        with:
          path: |
            nextjs
            adapter
            ~/.cache/ms-playwright
          key: build-${{ github.sha }}-${{ github.run_id }}

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Setup pnpm
        run: npm i -g corepack@0.31 && corepack enable

      - name: Ensure Playwright browser
        working-directory: nextjs
        run: pnpm playwright install chromium

      - name: Make scripts executable
        run: chmod +x adapter/scripts/e2e-deploy.sh
          adapter/scripts/e2e-logs.sh
          adapter/scripts/e2e-cleanup.sh

      - name: Run deploy tests
        working-directory: nextjs
        env:
          NEXT_TEST_MODE: deploy
          NEXT_E2E_TEST_TIMEOUT: 240000
          NEXT_EXTERNAL_TESTS_FILTERS: test/deploy-tests-manifest.json
          ADAPTER_DIR: ${{ github.workspace }}/adapter
          IS_TURBOPACK_TEST: 1
          NEXT_TEST_JOB: 1
          NEXT_TELEMETRY_DISABLED: 1

          # Change these to your adapter's scripts
          # Keep as-is if the scripts are in the adapter repository `scripts` directory
          NEXT_TEST_DEPLOY_SCRIPT_PATH: ${{ github.workspace }}/adapter/scripts/e2e-deploy.sh
          NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH: ${{ github.workspace }}/adapter/scripts/e2e-logs.sh
          NEXT_TEST_CLEANUP_SCRIPT_PATH: ${{ github.workspace }}/adapter/scripts/e2e-cleanup.sh
        run: node run-tests.js --timings -g ${{ matrix.group }} -c 2 --type e2e
```

The test harness looks for these environment variables:

- `NEXT_TEST_DEPLOY_SCRIPT_PATH`: Path to the executable that builds and deploys the isolated test app
- `NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH`: Path to the executable that returns build and runtime logs for that deployment
- `NEXT_TEST_CLEANUP_SCRIPT_PATH`: Path to the optional executable that tears the deployment down after the test run

## Custom deploy script contract

The deploy script `NEXT_TEST_DEPLOY_SCRIPT_PATH` is executed with `cwd` set to the isolated temporary app created by the Next.js test harness.

The deploy script must follow this contract:

- Exit with a non-zero code on failure.
- Print the deployment URL to `stdout`. This will be used to verify the deployment. Avoid writing anything else to `stdout`.
- Write diagnostic output to `stderr` or to files inside the working directory.

Because the deploy script and logs script run as separate processes, any data you want to use later, such as build IDs or server logs, should be persisted to files inside the working directory.

Example deploy script:

```bash filename="scripts/e2e-deploy.sh"
#!/usr/bin/env bash
set -euo pipefail

# Install the adapter, build the app, and deploy or start it.
node -e "
const pkg=JSON.parse(require('fs').readFileSync('package.json','utf8'));
pkg.dependencies=pkg.dependencies||{};
pkg.dependencies['adapter']='file:${ADAPTER_DIR}';
require('fs').writeFileSync('package.json',JSON.stringify(pkg,null,2));
" >&2

# Set the adapter path so that the app uses it.
export NEXT_ADAPTER_PATH="${ADAPTER_DIR}/dist/index.js"

# Write any metadata needed later to files in the working directory.
BUILD_ID="$(cat .next/BUILD_ID)"
DEPLOYMENT_ID="my-adapter-local"
# If your adapter generates an immutable asset token, set it here.
# Otherwise use "undefined" to indicate there is none.
IMMUTABLE_ASSET_TOKEN="undefined"

{
  echo "BUILD_ID: $BUILD_ID"
  echo "DEPLOYMENT_ID: $DEPLOYMENT_ID"
  echo "IMMUTABLE_ASSET_TOKEN: $IMMUTABLE_ASSET_TOKEN"
} >> .adapter-build.log

# Build the app
pnpm build

# Start or deploy the app. Capture the URL at this point or make the script output the URL to stdout.
provider-cli-to-deploy

# Example URL output:
# echo "http://127.0.0.1:3000"
```

## Custom logs script contract

The logs script `NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH` is executed with `cwd` set to the isolated temporary app created by the Next.js test harness.

Additionally it receives `NEXT_TEST_DIR` and `NEXT_TEST_DEPLOY_URL` as environment variables.

Its output must include lines starting with:

- `BUILD_ID:`
- `DEPLOYMENT_ID:`
- `IMMUTABLE_ASSET_TOKEN:` (use the value `undefined` if your adapter does not produce one)

After those markers, the logs script can print any additional build or server logs that would help debug failures.

```bash filename="scripts/e2e-logs.sh"
#!/usr/bin/env bash
set -euo pipefail

if [ -f ".adapter-build.log" ]; then
  cat ".adapter-build.log"
fi

if [ -f ".adapter-server.log" ]; then
  echo "=== .adapter-server.log ==="
  cat ".adapter-server.log"
fi
```

One pattern is to have the deploy script write `.adapter-build.log` and `.adapter-server.log`, then have the logs script replay those files so the harness can extract the required markers. This is one option, each platform has different ways to get the logs.

## Custom cleanup script contract

The cleanup script `NEXT_TEST_CLEANUP_SCRIPT_PATH` is executed with `cwd` set to the isolated temporary app created by the Next.js test harness.

Additionally it receives `NEXT_TEST_DIR` and `NEXT_TEST_DEPLOY_URL` as environment variables.

The cleanup script can be used to clean up any resources created by the deploy script. It runs after the tests have completed.
