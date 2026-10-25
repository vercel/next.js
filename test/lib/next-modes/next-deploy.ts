import path from 'path'
import dns from 'dns'
import execa from 'execa'
import fs from 'fs-extra'
import { load, dump } from 'js-yaml'
import * as tar from 'next/dist/compiled/tar'
import { NextInstance, type NextInstanceOpts } from './base'
import * as projectEnv from '../../../scripts/reset-project.mjs'
import { Span } from 'next/dist/trace'
import { setTimeout } from 'timers/promises'
import { FileRef } from '../e2e-utils'
import { PROXY_HOST_MAP_ENV_KEY } from '../browsers/launch'
import { packPackages, PNPM_TEST_DIR_SETTINGS } from '../create-next-install'
import {
  getPnpmSecuritySettings,
  mergeSettingsIntoYaml,
} from '../pnpm-security-settings'

// Build-log polling bounds. See `fetchBuildLogsUntilComplete`.
const BUILD_LOGS_INITIAL_RETRY_DELAY_MS = 2_000
const BUILD_LOGS_MAX_RETRY_DELAY_MS = 10_000
const BUILD_LOGS_INSPECT_TIMEOUT_MS = 30_000
const BUILD_LOGS_MAX_POLL_MS = 180_000
// Headroom left before the setup hook's jest timeout so the harness can fail
// with its own diagnostic instead of an opaque hook timeout.
const SETUP_HOOK_MARGIN_MS = 20_000

const BUILD_LOG_MARKERS = [
  'BUILD_ID',
  'DEPLOYMENT_ID',
  'NEXT_SUPPORTS_IMMUTABLE_ASSETS',
] as const

function hasBuildLogMarker(output: string, marker: string): boolean {
  // Match `parseIdsFromCliOutput`, which rejects a blank value.
  return !!output.match(new RegExp(`${marker}: (.+)`))?.[1]?.trim()
}

function hasAllBuildLogMarkers(output: string): boolean {
  return BUILD_LOG_MARKERS.every((marker) => hasBuildLogMarker(output, marker))
}

// Lines `vercel inspect --logs` prints itself, as opposed to build-log lines.
const VERCEL_CLI_OWN_LINE =
  /^(?:Vercel CLI \d|Fetching deployment |status\s|>\s|Error:|WARN!|Warning:)/

function stripAnsi(output: string): string {
  // eslint-disable-next-line no-control-regex -- strip ANSI escape codes
  return output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

/**
 * Whether `vercel inspect --logs` output contains any build-log lines, rather
 * than only the CLI's own header and status lines (which it prints even when
 * the log query returns nothing).
 */
function hasBuildLogLines(output: string): boolean {
  return stripAnsi(output)
    .split('\n')
    .some((line) => {
      const trimmed = line.trim()
      return trimmed !== '' && !VERCEL_CLI_OWN_LINE.test(trimmed)
    })
}

/**
 * The jest timeout of the setup hook that runs `createNext`/`start()`, mirroring
 * `setupTimeout` in `test/lib/e2e-utils/index.ts` (which imports this module,
 * so it can't be imported from there).
 */
function getSetupHookTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.NEXT_E2E_TEST_TIMEOUT ?? '', 10)
  if (!Number.isNaN(parsed)) return parsed
  return (process.platform === 'win32' ? 240 : 120) * 1000
}

// `vercel deploy` retries for network errors that happen before the CLI
// reports a deployment, e.g. `Error: fetch failed` while uploading.
const DEPLOY_RETRY_DELAYS_MS = [5_000, 10_000]
const DEPLOY_RETRY_MIN_REMAINING_MS = 60_000
// An `Error:` line the CLI prints for a failed request.
const TRANSIENT_NETWORK_ERROR_LINE =
  /^Error: .*(?:fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|socket hang up)/m
// Diagnostics that mean a retry can't help, even next to a network error.
const NON_RETRYABLE_DEPLOY_ERROR =
  /\b(?:Unauthorized|Forbidden|Not authorized|invalid token|Build failed)\b|Command ".*" exited/i
// The `Inspect`/`Preview`/`Production` lines the CLI prints once a deployment
// exists.
const DEPLOYMENT_URL_LINE = /^\s*(?:Inspect|Preview|Production)\s+https?:\/\//m

function isTransientPreUrlDeployFailure(result: {
  exitCode: number
  stdout: string
  stderr: string
}): boolean {
  if (result.exitCode === 0) return false
  try {
    new URL(result.stdout.trim())
    return false
  } catch {}
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`)
  return (
    !DEPLOYMENT_URL_LINE.test(output) &&
    !NON_RETRYABLE_DEPLOY_ERROR.test(output) &&
    TRANSIENT_NETWORK_ERROR_LINE.test(output)
  )
}

export class NextDeployInstance extends NextInstance {
  private _cliOutput: string
  private _buildId: string
  private _deploymentId: string | undefined
  private _supportsImmutableAssets: boolean = false
  private _writtenHostsLine: string | null = null
  private _restoreDnsLookup: (() => void) | null = null
  private _startPromise: Promise<void> | undefined
  private _npmrcAuthFile: string | undefined

  constructor(opts: NextInstanceOpts) {
    super(opts)

    if (typeof opts.files === 'string' || opts.files instanceof FileRef) {
      this.env = {
        NEXT_PRIVATE_LOCAL_DEV: '1',
        ...this.env,
      }
    }
  }

  protected throwIfUnavailable(): void | never {
    if (this.isStopping !== null) {
      throw new Error('Next.js is no longer available.', {
        cause: this.isStopping,
      })
    }
    if (this.isDestroyed !== null) {
      throw new Error('Next.js is no longer available.', {
        cause: this.isDestroyed,
      })
    }
    if (this.childProcess === undefined) {
      // deploy tests don't have access to the process
    }
  }

  public get buildId() {
    // get deployment ID via fetch since we can't access
    // build artifacts directly
    return this._buildId
  }

  public get deploymentId() {
    return this._deploymentId
  }

  public get supportsImmutableAssets() {
    return process.env.IS_TURBOPACK_TEST ? this._supportsImmutableAssets : false
  }

  private async deployUsingCustomScript(): Promise<{ url: string }> {
    const deployScriptPath = process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH!

    require('console').log(
      `Deploying project using custom script: ${deployScriptPath}`
    )

    // Prepare environment variables to pass to the deploy script
    const scriptEnv = {
      ...process.env,
      // Pass the test directory to the script
      NEXT_TEST_DIR: this.testDir,
      // Pass test-specific env vars
      ...this.env,
    }

    const deployment = execa(deployScriptPath, [], {
      cwd: this.testDir,
      env: scriptEnv,
      reject: false,
    })
    deployment.stderr?.pipe(process.stderr)
    const deployRes = await deployment

    if (deployRes.exitCode !== 0) {
      await this.throwDeploymentError(
        deployRes,
        () => this.fetchBuildLogsUsingCustomScript(),
        'Custom deploy script failed'
      )
    }

    // The script should output the deployment URL to stdout
    const url = deployRes.stdout.trim()
    if (!url) {
      throw new Error(
        'Custom deploy script did not return a deployment URL on stdout'
      )
    }

    // Validate it's a proper URL
    try {
      new URL(url)
    } catch (err) {
      throw new Error(`Custom deploy script returned invalid URL: ${url}`, {
        cause: err,
      })
    }

    return { url }
  }

  private async throwDeploymentError(
    result: { exitCode: number; stdout: string; stderr?: string },
    fetchBuildLogs: () => Promise<string>,
    message: string
  ): Promise<never> {
    this._cliOutput = result.stdout + (result.stderr || '')
    const error = new Error(
      `${message}: ${this._cliOutput} (${result.exitCode})`
    )

    try {
      // Upload/authentication failures may not have a deployment URL. Retain
      // their CLI output even when there are no remote build logs to fetch.
      this._parsedUrl = new URL(result.stdout.trim())
      this._url = this._parsedUrl.href
      const buildLogs = await fetchBuildLogs()
      // The deploy CLI may already replay build logs. Use one fetched transcript
      // so assertions can count diagnostics without counting those replays.
      // Keep the original CLI diagnostics in the error and as a fallback.
      if (buildLogs.trim()) this._cliOutput = buildLogs
    } catch (cause) {
      error.cause = cause
    }

    // Preserve the instance and its logs for callers that catch start().
    // Failed builds do not produce the successful-build ID markers.
    throw error
  }

  private async fetchBuildLogsUsingCustomScript(): Promise<string> {
    const logsScriptPath = process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH!

    require('console').log(
      `Fetching build logs using custom script: ${logsScriptPath}`
    )

    const scriptEnv = {
      ...process.env,
      NEXT_TEST_DIR: this.testDir,
      // Pass the deployment URL to the logs script
      NEXT_TEST_DEPLOY_URL: this._url,
      ...this.env,
    }

    const logsRes = await execa(logsScriptPath, [], {
      cwd: this.testDir,
      env: scriptEnv,
      reject: false,
    })

    if (logsRes.exitCode !== 0) {
      throw new Error(
        `Custom deploy logs script failed: ${logsRes.stdout} ${logsRes.stderr} (${logsRes.exitCode})`
      )
    }

    // The script should output the build logs to stdout
    return logsRes.stdout + logsRes.stderr
  }

  private async cleanupUsingCustomScript(): Promise<void> {
    const cleanupScriptPath = process.env.NEXT_TEST_CLEANUP_SCRIPT_PATH!

    require('console').log(
      `Running cleanup using custom script: ${cleanupScriptPath}`
    )

    const scriptEnv = {
      ...process.env,
      NEXT_TEST_DIR: this.testDir,
      NEXT_TEST_DEPLOY_URL: this._url,
      ...this.env,
    }

    const cleanupChild = execa(cleanupScriptPath, [], {
      cwd: this.testDir,
      env: scriptEnv,
      reject: false,
      stderr: 'inherit',
    })

    cleanupChild.stdout?.pipe(process.stdout)
    cleanupChild.stderr?.pipe(process.stderr)

    const { exitCode } = await cleanupChild

    if (exitCode !== 0) {
      throw new Error(
        `Custom cleanup script failed with exit code: ${exitCode}`
      )
    }
  }

  private parseIdsFromCliOutput(): void {
    const buildId = this._cliOutput.match(/BUILD_ID: (.+)/)?.[1]?.trim()
    if (!buildId) {
      throw new Error(`Failed to get buildId from logs ${this._cliOutput}`)
    }
    this._buildId = buildId
    const deploymentId = this._cliOutput
      .match(/DEPLOYMENT_ID: (.+)/)?.[1]
      ?.trim()
    if (!deploymentId) {
      throw new Error(`Failed to get deploymentId from logs ${this._cliOutput}`)
    }
    this._deploymentId = deploymentId
    const supportsImmutableAssets = this._cliOutput
      .match(/NEXT_SUPPORTS_IMMUTABLE_ASSETS: (.+)/)?.[1]
      ?.trim()
    if (!supportsImmutableAssets) {
      throw new Error(
        `Failed to get supportsImmutableAssets from logs ${this._cliOutput}`
      )
    }
    this._supportsImmutableAssets =
      supportsImmutableAssets === '1' ? true : false

    require('console').log(
      `Got buildId: ${this._buildId}, deploymentId: ${this._deploymentId}, supportsImmutableAssets: ${this._supportsImmutableAssets}`
    )
  }

  private async fetchBuildLogsUntilComplete(
    url: string,
    vercelEnv: NodeJS.ProcessEnv,
    vercelFlags: string[],
    deployStartedAt: number
  ): Promise<string> {
    // The fixture's `post-build` script prints the BUILD_ID, DEPLOYMENT_ID and
    // NEXT_SUPPORTS_IMMUTABLE_ASSETS markers as the final lines of the build
    // (see `base.ts`). A deployment can report `Ready` before those lines are
    // available to `vercel inspect --logs`, which then returns a truncated
    // transcript, or only its own header and status lines, and a single call
    // can hang. Re-query with backoff and a per-call timeout until all markers
    // appear, within a deadline that leaves headroom before the setup hook's
    // jest timeout. The first attempt always runs.
    const pollStartedAt = Date.now()
    const deadline = Math.min(
      deployStartedAt + getSetupHookTimeoutMs() - SETUP_HOOK_MARGIN_MS,
      pollStartedAt + BUILD_LOGS_MAX_POLL_MS
    )
    let retryDelayMs = BUILD_LOGS_INITIAL_RETRY_DELAY_MS
    // The most recent transcript that contained build-log lines. A later
    // attempt that times out or comes back empty must not discard it.
    let transcript = ''
    let lastOutput = ''
    let failure: string | undefined
    let attempt = 0

    for (;;) {
      attempt++
      const remainingMs = deadline - Date.now()
      const timeout =
        remainingMs > 0
          ? Math.min(BUILD_LOGS_INSPECT_TIMEOUT_MS, remainingMs)
          : BUILD_LOGS_INSPECT_TIMEOUT_MS

      failure = undefined
      try {
        const buildLogs = await execa(
          'vercel',
          ['inspect', '--logs', url, ...vercelFlags],
          { env: vercelEnv, reject: false, timeout }
        )
        // Build logs are piped to stderr, so combine both streams.
        lastOutput = buildLogs.stdout + buildLogs.stderr
        if (buildLogs.timedOut) {
          failure = `timed out after ${timeout}ms`
        } else if (buildLogs.exitCode !== 0) {
          failure = `exited with ${buildLogs.exitCode}: ${buildLogs.stderr}`
        }
      } catch (error) {
        lastOutput = ''
        failure = `failed: ${error}`
      }

      if (failure === undefined && hasAllBuildLogMarkers(lastOutput)) {
        require('console').log(
          `Found build log markers for ${url} on attempt ${attempt} after ${Date.now() - pollStartedAt}ms`
        )
        return lastOutput
      }
      if (hasBuildLogLines(lastOutput)) {
        transcript = lastOutput
      }

      // Only start another attempt if it can begin before the deadline.
      if (Date.now() + retryDelayMs >= deadline) {
        break
      }
      require('console').log(
        `Build log markers not yet available for ${url} (attempt ${attempt}${failure ? `, vercel inspect ${failure}` : ''}). Retrying in ${retryDelayMs}ms...`
      )
      await setTimeout(retryDelayMs)
      retryDelayMs = Math.min(retryDelayMs * 2, BUILD_LOGS_MAX_RETRY_DELAY_MS)
      // The wait can overshoot; never start a retry after the deadline.
      if (Date.now() >= deadline) {
        break
      }
    }

    // The markers never appeared within the deadline. Keep the best transcript
    // for callers that catch start(), and say why it can't be parsed.
    const output = transcript || lastOutput
    this._cliOutput = output
    const missingMarkers = BUILD_LOG_MARKERS.filter(
      (marker) => !hasBuildLogMarker(output, marker)
    )
    const reason = !hasBuildLogLines(output)
      ? '`vercel inspect --logs` returned no build-log lines, only its own output; the build logs are likely not available from Vercel yet'
      : missingMarkers.length > 0
        ? `the build logs are missing the ${missingMarkers.join(', ')} marker(s)`
        : 'the vercel inspect call that printed the markers did not succeed'
    throw new Error(
      `Failed to get buildId from logs of ${url} after ${attempt} attempt(s) in ${Date.now() - pollStartedAt}ms: ${reason}.` +
        (failure ? `\nThe last vercel inspect call ${failure}` : '') +
        `\n${output}`
    )
  }

  public async setup(parentSpan: Span) {
    await super.setup(parentSpan)
    await super.createTestDir({ parentSpan, skipInstall: true })

    await this.writeMirrorNpmrcIfNecessary()

    if (
      !process.env.NEXT_TEST_DEPLOY_URL?.trim() &&
      !process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH?.trim() &&
      !process.env.NEXT_TEST_VERSION
    ) {
      await this.prepareLocalPackages(parentSpan)
    }

    this.preparePnpmSettings()
  }

  private preparePnpmSettings(): void {
    const workspacePath = path.join(this.testDir, 'pnpm-workspace.yaml')
    const settings = {
      ...getPnpmSecuritySettings(),
      ...PNPM_TEST_DIR_SETTINGS,
      // Our preview tarballs reference other packages from the same commit by
      // URL. pnpm rejects those subdependencies even with explicit overrides.
      ...(process.env.NEXT_TEST_VERSION && { blockExoticSubdeps: false }),
    }
    let workspace: string
    if (fs.existsSync(workspacePath)) {
      workspace = mergeSettingsIntoYaml(
        fs.readFileSync(workspacePath, 'utf8'),
        settings
      )
    } else {
      workspace = dump(settings)
    }
    this.writeFixtureConfiguration(workspacePath, workspace)
  }

  private async deploy() {
    const deployStartedAt = Date.now()
    const existingDeployUrl = process.env.NEXT_TEST_DEPLOY_URL?.trim()
    const customDeployScriptPath =
      process.env.NEXT_TEST_DEPLOY_SCRIPT_PATH?.trim()
    const customLogsScriptPath =
      process.env.NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH?.trim()

    // Check if using an existing deployment URL (takes priority)
    if (existingDeployUrl) {
      try {
        this._url = new URL(existingDeployUrl).toString()
      } catch (err) {
        throw new Error(
          `Invalid NEXT_TEST_DEPLOY_URL value: ${existingDeployUrl}`,
          { cause: err }
        )
      }
      require('console').log(`Using existing deployment URL: ${this._url}`)

      this._parsedUrl = new URL(this._url)

      // Configure proxy address if needed
      await this.configureProxyAddress()

      // Use custom logs script if provided, otherwise use Vercel CLI
      if (customLogsScriptPath) {
        this._cliOutput = await this.fetchBuildLogsUsingCustomScript()
      } else {
        // Use vercel inspect to get logs for existing deployment
        const buildLogs = await execa(
          'vercel',
          ['inspect', '--logs', this._url],
          {
            env: process.env,
            reject: false,
          }
        )
        this._cliOutput = buildLogs.stdout + buildLogs.stderr
        if (buildLogs.exitCode !== 0) {
          throw new Error(
            `Failed to get build output logs: ${buildLogs.stderr}`
          )
        }
      }

      this.parseIdsFromCliOutput()
      return
    }

    // Check if using custom deploy script
    if (customDeployScriptPath) {
      if (!customLogsScriptPath) {
        throw new Error(
          'NEXT_TEST_DEPLOY_LOGS_SCRIPT_PATH is required when using NEXT_TEST_DEPLOY_SCRIPT_PATH'
        )
      }

      const { url } = await this.deployUsingCustomScript()
      this._url = url

      this._parsedUrl = new URL(this._url)

      // Configure proxy address if needed
      await this.configureProxyAddress()

      require('console').log(`Deployment URL: ${this._url}`)

      // Use the custom logs script to get build logs and extract buildId
      this._cliOutput = await this.fetchBuildLogsUsingCustomScript()
      this.parseIdsFromCliOutput()
      return
    }

    // Original Vercel CLI deployment logic
    // ensure Vercel CLI is installed
    try {
      const res = await execa('vercel', ['--version'])
      require('console').log(`Using Vercel CLI version:`, res.stdout)
    } catch (_) {
      require('console').log(`Installing Vercel CLI`)
      await execa('npm', ['i', '-g', 'vercel@latest'], {
        stdio: 'inherit',
      })
    }

    const vercelFlags: string[] = []
    const NEXT_ENABLE_ADAPTER = process.env.NEXT_ENABLE_ADAPTER === '1'
    const IS_TURBOPACK_TEST = process.env.IS_TURBOPACK_TEST

    const TEST_TEAM_NAME = NEXT_ENABLE_ADAPTER
      ? projectEnv.ADAPTER_TEST_TEAM_NAME
      : IS_TURBOPACK_TEST
        ? projectEnv.TURBOPACK_TEST_TEAM_NAME
        : projectEnv.TEST_TEAM_NAME

    const TEST_TOKEN = NEXT_ENABLE_ADAPTER
      ? projectEnv.ADAPTER_TEST_TOKEN
      : IS_TURBOPACK_TEST
        ? projectEnv.TURBOPACK_TEST_TOKEN
        : projectEnv.TEST_TOKEN

    // If the team name is available in the environment, use it as the scope.
    if (TEST_TEAM_NAME) {
      vercelFlags.push('--scope', TEST_TEAM_NAME)
    }
    const vercelEnv = { ...process.env }

    // The Vercel CLI uses @vercel/detect-agent to detect when it's running
    // under an AI coding agent (Claude Code, Cursor, Codex, …) and, when it
    // does, switches `vercel deploy` stdout from a plain URL to a JSON
    // manifest intended for AI consumption — which breaks
    // `new URL(deployRes.stdout)` below. The CLI honors an explicit
    // `--non-interactive=false` as an override of the agent default, and the
    // JSON-vs-plain decision keys off `client.nonInteractive`, so passing
    // the flag is enough to force plain-URL output for both link and deploy.
    vercelFlags.push('--non-interactive=false')

    if (process.env.RUNNER_DEBUG === '1') {
      vercelFlags.push('--debug')
    }

    // If the token is available in the environment, use it as the token in the
    // environment. The CLI reads `VERCEL_TOKEN` (since vercel@50.12.1) and then
    // neither reads nor writes the shared `auth.json`, which keeps parallel
    // test jobs from racing on a non-atomically written credentials file.
    if (TEST_TOKEN) {
      vercelEnv.VERCEL_TOKEN = TEST_TOKEN
    }

    // validate auth is configured in CI
    if (process.env.NEXT_TEST_JOB) {
      if (!TEST_TOKEN && !TEST_TEAM_NAME) {
        throw new Error(
          'Missing TEST_TOKEN and TEST_TEAM_NAME environment variables for CI'
        )
      }
    }

    require('console').log(`Linking project at ${this.testDir}`)

    // link the project
    const linkRes = await execa(
      'vercel',
      ['link', '-p', projectEnv.TEST_PROJECT_NAME, '--yes', ...vercelFlags],
      {
        cwd: this.testDir,
        env: vercelEnv,
        reject: false,
      }
    )

    if (linkRes.exitCode !== 0) {
      throw new Error(
        `Failed to link project ${linkRes.stdout} ${linkRes.stderr} (${linkRes.exitCode})`
      )
    }
    require('console').log(`Deploying project at ${this.testDir}`)

    const additionalEnv: string[] = []

    for (const key of Object.keys(this.env || {})) {
      additionalEnv.push(`${key}=${this.env[key]}`)
    }

    additionalEnv.push(
      `VERCEL_CLI_VERSION=${process.env.VERCEL_CLI_VERSION || 'vercel@latest'}`
    )

    // So that our `package.json#packageManager` field is respected when building on Vercel
    additionalEnv.push(`ENABLE_EXPERIMENTAL_COREPACK=1`)

    // Route the build to a named hive, and to a specific build-container image.
    // The dispatcher reads the image version only for a build on a forced hive.
    // A version without a hive falls back to the default image and reports no
    // error, so reject that combination here.
    const forceBuildInHive = process.env.VERCEL_FORCE_BUILD_IN_HIVE
    const buildContainerVersion = process.env.VERCEL_BUILD_CONTAINER_VERSION

    if (buildContainerVersion && !forceBuildInHive) {
      throw new Error(
        'VERCEL_BUILD_CONTAINER_VERSION requires VERCEL_FORCE_BUILD_IN_HIVE to be set to a hive ID.'
      )
    }

    if (forceBuildInHive) {
      additionalEnv.push(`VERCEL_FORCE_BUILD_IN_HIVE=${forceBuildInHive}`)
    }

    if (buildContainerVersion) {
      additionalEnv.push(
        `VERCEL_BUILD_CONTAINER_VERSION=${buildContainerVersion}`
      )
    }

    if (process.env.IS_TURBOPACK_TEST) {
      additionalEnv.push(`IS_TURBOPACK_TEST=1`)
    }
    if (process.env.IS_WEBPACK_TEST) {
      additionalEnv.push(`IS_WEBPACK_TEST=1`)
    }
    if (NEXT_ENABLE_ADAPTER) {
      additionalEnv.push(`NEXT_ENABLE_ADAPTER=1`)
    } else {
      additionalEnv.push(`NEXT_ENABLE_ADAPTER=0`)
    }

    const deployArgs = [
      'deploy',
      '--build-env',
      'NEXT_PRIVATE_TEST_MODE=e2e',
      '--build-env',
      'NEXT_TELEMETRY_DISABLED=1',
      '--build-env',
      'VERCEL_NEXT_BUNDLED_SERVER=1',
      // See: https://pnpm.io/npmrc#environment-variables-in-auth-settings
      ...(this._npmrcAuthFile
        ? ['--build-env', `PNPM_CONFIG_NPMRC_AUTH_FILE=${this._npmrcAuthFile}`]
        : []),
      ...additionalEnv.flatMap((pair) => ['--env', pair, '--build-env', pair]),
      '--force',
      ...vercelFlags,
    ]
    const deployDeadline =
      deployStartedAt + getSetupHookTimeoutMs() - SETUP_HOOK_MARGIN_MS
    let deployRes: execa.ExecaReturnValue
    for (let attempt = 1; ; attempt++) {
      const deployment = execa('vercel', deployArgs, {
        cwd: this.testDir,
        env: vercelEnv,
        reject: false,
      })
      // Keep showing deployment progress while also retaining failure output.
      deployment.stderr?.pipe(process.stderr)
      deployRes = await deployment

      // Retry only network errors from before the CLI reported a deployment,
      // and only while enough of the setup budget remains to build it.
      const retryDelayMs = DEPLOY_RETRY_DELAYS_MS[attempt - 1]
      if (
        retryDelayMs === undefined ||
        !isTransientPreUrlDeployFailure(deployRes) ||
        deployDeadline - Date.now() - retryDelayMs <
          DEPLOY_RETRY_MIN_REMAINING_MS
      ) {
        break
      }
      // The request may have reached Vercel before the connection dropped, so
      // a retry can leave an orphaned preview deployment behind.
      require('console').log(
        `vercel deploy failed with a transient network error before reporting a deployment (attempt ${attempt}/${DEPLOY_RETRY_DELAYS_MS.length + 1}); retrying in ${retryDelayMs}ms. A deployment may have been created anyway.\n${deployRes.stdout}${deployRes.stderr}`
      )
      await setTimeout(retryDelayMs)
    }

    if (deployRes.exitCode !== 0) {
      await this.throwDeploymentError(
        deployRes,
        async () => {
          const logs = await execa(
            'vercel',
            ['inspect', '--logs', this._url, ...vercelFlags],
            { env: vercelEnv, reject: false }
          )
          // inspect exits 1 for a failed deployment even when logs are returned.
          if (logs.exitCode !== 0 && logs.exitCode !== 1) {
            throw new Error(`Failed to get build output logs: ${logs.stderr}`)
          }
          return (logs.stdout + logs.stderr).replace(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z {2}/gm,
            ''
          )
        },
        'Failed to deploy project'
      )
    }

    // the CLI gives just the deployment URL back when not a TTY
    this._url = deployRes.stdout
    this._parsedUrl = new URL(this._url)

    // Configure proxy address if needed
    await this.configureProxyAddress()

    require('console').log(`Deployment URL: ${this._url}`)

    // Fetch the build logs to extract the build/deployment id markers that the
    // fixture's `post-build` script prints. The deployment can report `Ready`
    // (and `vercel deploy` can return) before its build logs are available, so
    // re-query until the markers appear rather than failing on the first
    // incomplete read. TODO: Combine with runtime logs (via `vercel logs`)
    this._cliOutput = await this.fetchBuildLogsUntilComplete(
      this._url,
      vercelEnv,
      vercelFlags,
      deployStartedAt
    )

    this.parseIdsFromCliOutput()
  }

  private writeFixtureConfiguration(filePath: string, contents: string): void {
    fs.rmSync(filePath, { force: true })
    fs.writeFileSync(filePath, contents)
  }

  /**
   * This method stages local JavaScript tarballs and rewrites the fixture's
   * dependencies and overrides to relative `file:` references. It adds
   * published SWC dependencies because locally built native binaries may target
   * a different platform than the remote build.
   */
  private async prepareLocalPackages(parentSpan: Span): Promise<void> {
    const packagePaths = process.env.NEXT_TEST_PKG_PATHS
      ? new Map<string, string>(JSON.parse(process.env.NEXT_TEST_PKG_PATHS))
      : await packPackages(parentSpan)
    for (const name of ['next', '@next/env']) {
      if (!packagePaths.has(name)) {
        throw new Error(`Missing packed package for local deployment: ${name}`)
      }
    }

    const directoryName = 'next-test-packages'
    await fs.mkdir(path.join(this.testDir, directoryName))
    const localPackages = new Map<string, string>()
    for (const [name, source] of packagePaths) {
      const relativePath = path.posix.join(directoryName, name, 'packed.tgz')
      if (
        !relativePath.startsWith(`${directoryName}/`) ||
        name.includes('\\')
      ) {
        throw new Error(`Invalid packed package name: ${name}`)
      }
      const destination = path.join(this.testDir, relativePath)
      await fs.ensureDir(path.dirname(destination))
      await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL)

      // The staged packages use exact local peer versions so npm accepts
      // prereleases without extra peer overrides.
      const {
        peerDependencies,
      }: { peerDependencies?: Record<string, string> } = await fs.readJSON(
        path.join(path.dirname(source), 'package.json')
      )
      const peerVersions = new Map<string, string>()
      for (const peerName of Object.keys(peerDependencies ?? {})) {
        const peerSource = packagePaths.get(peerName)
        if (peerSource === undefined) {
          continue
        }
        const { version } = await fs.readJSON(
          path.join(path.dirname(peerSource), 'package.json')
        )
        if (typeof version !== 'string' || version.length === 0) {
          throw new Error(
            `Missing version for packed peer dependency: ${peerName}`
          )
        }
        peerVersions.set(peerName, version)
      }
      if (peerVersions.size > 0) {
        const temporaryDirectory = await fs.mkdtemp(
          path.join(this.testDir, '.next-test-package-')
        )
        try {
          await tar.x({ file: destination, cwd: temporaryDirectory })
          const manifestPath = path.join(
            temporaryDirectory,
            'package/package.json'
          )
          const manifest = await fs.readJSON(manifestPath)
          for (const [peerName, version] of peerVersions) {
            if (manifest.peerDependencies?.[peerName] !== undefined) {
              manifest.peerDependencies[peerName] = version
            }
          }
          await fs.writeFile(
            manifestPath,
            JSON.stringify(manifest, null, 2) + '\n'
          )
          await tar.c(
            { file: destination, cwd: temporaryDirectory, gzip: true },
            ['package']
          )
        } finally {
          await fs.remove(temporaryDirectory)
        }
      }
      localPackages.set(name, `file:./${relativePath}`)
    }

    const packageJsonPath = path.join(this.testDir, 'package.json')
    const packageJson: {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      overrides?: Record<string, unknown>
      resolutions?: Record<string, string>
      pnpm?: { overrides?: Record<string, string> }
    } = await fs.readJSON(packageJsonPath)
    const dependencyFields = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ] as const
    for (const field of dependencyFields) {
      const dependencies = packageJson[field]
      if (dependencies === undefined) {
        continue
      }
      for (const name of Object.keys(dependencies)) {
        const localPackage = localPackages.get(name)
        if (localPackage !== undefined) {
          // npm requires identity overrides to match the new dependency.
          if (packageJson.overrides !== undefined) {
            for (const [key, override] of Object.entries(
              packageJson.overrides
            )) {
              if (key !== name && !key.startsWith(`${name}@`)) {
                continue
              }
              if (override === dependencies[name]) {
                packageJson.overrides[key] = localPackage
              } else if (
                override !== null &&
                typeof override === 'object' &&
                ('.' in override
                  ? override['.'] === dependencies[name]
                  : key === `${name}@${dependencies[name]}`)
              ) {
                Object.assign(override, { '.': localPackage })
              }
            }
          }
          dependencies[name] = localPackage
        }
      }
    }

    // Generated overrides follow fixture rules because npm uses the first
    // matching rule.
    packageJson.overrides ??= {}
    const workspaceOverrides: Record<string, string> = {}
    for (const [name, localPackage] of localPackages) {
      if (
        dependencyFields.some(
          (field) => packageJson[field]?.[name] !== undefined
        )
      ) {
        continue
      }
      workspaceOverrides[name] = localPackage
      if (packageJson.overrides[name] === undefined) {
        packageJson.overrides[name] = localPackage
      }
    }
    packageJson.resolutions = {
      ...workspaceOverrides,
      ...packageJson.resolutions,
    }
    packageJson.pnpm = {
      ...packageJson.pnpm,
      overrides: {
        ...packageJson.resolutions,
        ...packageJson.pnpm?.overrides,
      },
    }

    // Source tarballs omit the platform dependencies added during publication.
    const version: string = require('next/package.json').version
    const nativePackagesDirectory = path.join(
      __dirname,
      '../../../crates/next-napi-bindings/npm'
    )
    packageJson.optionalDependencies ??= {}
    for (const platform of await fs.readdir(nativePackagesDirectory)) {
      if (platform.startsWith('.')) {
        continue
      }
      const { name }: { name: string } = await fs.readJSON(
        path.join(nativePackagesDirectory, platform, 'package.json')
      )
      if (
        packageJson.dependencies?.[name] === undefined &&
        packageJson.devDependencies?.[name] === undefined &&
        packageJson.optionalDependencies[name] === undefined
      ) {
        packageJson.optionalDependencies[name] = version
      }
    }

    this.writeFixtureConfiguration(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + '\n'
    )

    for (const filename of [
      'pnpm-workspace.yaml',
      '.vercelignore',
      '.nowignore',
    ]) {
      const filePath = path.join(this.testDir, filename)
      try {
        await fs.lstat(filePath)
      } catch (error) {
        if (error.code === 'ENOENT') {
          continue
        }
        throw error
      }
      const contents = await fs.readFile(filePath, 'utf8')
      if (filename === 'pnpm-workspace.yaml') {
        const workspace = (load(contents) ?? {}) as {
          overrides?: Record<string, string>
        }
        workspace.overrides = {
          ...packageJson.pnpm.overrides,
          ...workspace.overrides,
        }
        this.writeFixtureConfiguration(filePath, dump(workspace))
      } else if (contents !== '') {
        this.writeFixtureConfiguration(
          filePath,
          `${contents}\n!/${directoryName}\n!/${directoryName}/**\n`
        )
        break
      }
    }
    require('console').log(
      `Deploying local JavaScript packages with published SWC ${version}. Local native binaries are not included.`
    )
  }

  // Private preview builds authenticate with the remote build's Vercel OIDC
  // token. pnpm only expands auth placeholders in trusted configuration, so
  // pass a separate mirror auth file through PNPM_CONFIG_NPMRC_AUTH_FILE.
  // https://pnpm.io/npmrc#environment-variables-in-auth-settings
  // This keeps tokens out of uploaded source without trusting fixture .npmrc
  // files. Public builds need no auth file or OIDC token.
  private async writeMirrorNpmrcIfNecessary(): Promise<void> {
    const baseUrlRaw = process.env.NEXT_TEST_PREVIEW_BUILDS_BASE_URL
    const access = process.env.PREVIEW_BUILDS_ACCESS

    if (access !== 'private') {
      require('console').log(
        `Skipping mirror auth file: preview builds are public`
      )
      return
    }
    if (!baseUrlRaw) {
      require('console').warn(
        `Skipping mirror auth file: PREVIEW_BUILDS_ACCESS=private but NEXT_TEST_PREVIEW_BUILDS_BASE_URL is not set, so the remote build cannot authenticate to the mirror`
      )
      return
    }

    const baseUrl = new URL(baseUrlRaw)
    // Derive the npmrc auth key from the mirror base URL: strip the scheme and
    // ensure a trailing slash so it matches requests to that registry path.
    const registryKey = `//${baseUrl.host}${baseUrl.pathname.replace(/\/?$/, '/')}`

    require('console').log(`Writing mirror auth file: ${registryKey}`)
    const authFile = '.next-test-auth.npmrc'
    await fs.writeFile(
      path.join(this.testDir, authFile),
      `${registryKey}:_authToken=\${VERCEL_OIDC_TOKEN}\n`
    )
    this._npmrcAuthFile = authFile
  }

  /**
   * Redirects the deployment host to the proxy address for this process only.
   * The patched `dns.lookup` covers `fetch`, because Node resolves the
   * connection through it while the TLS handshake still uses the original
   * hostname for SNI. A valid certificate therefore still validates.
   *
   * This mode needs no `sudo`, and it keeps concurrent test files independent,
   * unlike the shared `/etc/hosts` file.
   */
  private redirectHostInProcess(hostname: string, address: string): void {
    require('console').log(
      `Redirecting ${hostname} to ${address} for this process`
    )

    const originalLookup = dns.lookup

    // `dns.lookup` answers for an IP address literal without a query, and it
    // answers in the shape that the caller's options ask for. The redirection
    // therefore replaces the hostname, passes the remaining arguments through
    // untouched, and lets Node produce the result.
    function patchedLookup(
      this: unknown,
      lookupHostname: string,
      ...args: unknown[]
    ): void {
      Reflect.apply(originalLookup, this, [
        lookupHostname === hostname ? address : lookupHostname,
        ...args,
      ])
    }

    // `dns.lookup` holds the argument names that `util.promisify` reads in a
    // hidden symbol property. The wrapper takes over every own property, so the
    // promisified form still resolves to an object instead of a bare address.
    Object.defineProperties(
      patchedLookup,
      Object.getOwnPropertyDescriptors(originalLookup)
    )

    dns.lookup = Object.assign(patchedLookup, originalLookup)

    this._restoreDnsLookup = () => {
      dns.lookup = originalLookup
    }

    process.env[PROXY_HOST_MAP_ENV_KEY] = `${hostname}=${address}`
  }

  private async configureProxyAddress(): Promise<void> {
    const proxyAddress = process.env.NEXT_TEST_PROXY_ADDRESS
    const redirectInProcess = !!process.env.NEXT_TEST_PROXY_IN_PROCESS

    // Validate that the proxy address is a valid IP address.
    if (!proxyAddress || !/^\d+\.\d+\.\d+\.\d+$/.test(proxyAddress)) {
      // Without a redirection the production CDN serves the deployment, so the
      // test passes and exercises none of the proxy under test. Fail instead of
      // ignoring an incomplete request for in-process redirection.
      if (redirectInProcess) {
        throw new Error(
          `NEXT_TEST_PROXY_IN_PROCESS needs a valid IP address in NEXT_TEST_PROXY_ADDRESS, received ${proxyAddress ? `"${proxyAddress}"` : 'no value'}.`
        )
      }

      return
    }

    if (redirectInProcess) {
      this.redirectHostInProcess(this._parsedUrl.hostname, proxyAddress)
    } else {
      // Otherwise we point the deployment domain to the proxy address through
      // the `/etc/hosts` file.
      this._writtenHostsLine = `${proxyAddress}\t${this._parsedUrl.hostname}\n`

      require('console').log(
        `Writing proxy address to hosts file: ${this._writtenHostsLine.trim()}`
      )

      // Using a child process, we'll use sudo to tee the hosts file to add the
      // proxy address to the target domain.
      await execa('sudo', ['tee', '-a', '/etc/hosts'], {
        input: this._writtenHostsLine,
        stdout: 'inherit',
        shell: true,
      })

      // Verify that the proxy address was written to the hosts file.
      const hostsFile = await fs.readFile('/etc/hosts', 'utf8')
      if (!hostsFile.includes(this._writtenHostsLine)) {
        throw new Error('Proxy address not found in hosts file after writing')
      }

      require('console').log(`Proxy address written to hosts file`)
    }
  }

  public async destroy() {
    // Run custom cleanup script if provided
    const customCleanupScriptPath =
      process.env.NEXT_TEST_CLEANUP_SCRIPT_PATH?.trim()
    if (customCleanupScriptPath && this._url) {
      await this.cleanupUsingCustomScript().catch((err) => {
        require('console').error(
          'Error running custom cleanup script, continuing with destroy:',
          err
        )
      })
    }

    if (this._restoreDnsLookup) {
      require('console').log(`Removing the in-process host redirection`)
      this._restoreDnsLookup()
      this._restoreDnsLookup = null
      delete process.env[PROXY_HOST_MAP_ENV_KEY]
    }

    // If configured, we should remove the proxy address from the hosts file.
    if (this._writtenHostsLine) {
      const trimmed = this._writtenHostsLine.trim()

      require('console').log(
        `Removing proxy address from hosts file: ${this._writtenHostsLine.trim()}`
      )

      const hostsFile = await fs.readFile('/etc/hosts', 'utf8')

      const cleanedHostsFile = hostsFile
        .split('\n')
        .filter((line) => line.trim() !== trimmed)
        .join('\n')

      await execa('sudo', ['tee', '/etc/hosts'], {
        input: cleanedHostsFile,
        stdout: 'inherit',
        shell: true,
      })

      require('console').log(`Removed proxy address from hosts file`)
    }

    // Run the super destroy to clean up the test directory.
    return super.destroy()
  }

  public get cliOutput() {
    return this._cliOutput || ''
  }

  public async start() {
    this.throwIfUnavailable()
    if (!this._startPromise) {
      this._cliOutput = ''
      this._url = ''
      // Reuse a ready deployment on subsequent calls, as start() did before
      // deployment moved out of setup(). A failed attempt can be retried.
      this._startPromise = this.deploy().catch((error) => {
        this._startPromise = undefined
        throw error
      })
    }
    await this._startPromise
  }

  public async patchFile(
    filename: string,
    content: string
  ): Promise<{ newFile: boolean }> {
    throw new Error('patchFile is not available in deploy test mode')
  }
  public async readFile(filename: string): Promise<string> {
    throw new Error('readFile is not available in deploy test mode')
  }
  public async deleteFile(filename: string): Promise<void> {
    throw new Error('deleteFile is not available in deploy test mode')
  }
  public async renameFile(
    filename: string,
    newFilename: string
  ): Promise<void> {
    throw new Error('renameFile is not available in deploy test mode')
  }
  public async readFileBuffer(filename: string): Promise<Buffer> {
    throw new Error('readFileBuffer is not available in deploy test mode')
  }
  public async writeFileBuffer(filename: string, data: Buffer): Promise<void> {
    throw new Error('writeFileBuffer is not available in deploy test mode')
  }
}
