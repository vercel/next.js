import os from 'os'
import path from 'path'
import dns from 'dns'
import execa from 'execa'
import fs from 'fs-extra'
import { NextInstance, type NextInstanceOpts } from './base'
import * as projectEnv from '../../../scripts/reset-project.mjs'
import { Span } from 'next/dist/trace'
import { setTimeout } from 'timers/promises'
import { FileRef } from '../e2e-utils'
import { PROXY_HOST_MAP_ENV_KEY } from '../browsers/launch'

export class NextDeployInstance extends NextInstance {
  private _cliOutput: string
  private _buildId: string
  private _deploymentId: string | undefined
  private _supportsImmutableAssets: boolean = false
  private _writtenHostsLine: string | null = null
  private _restoreDnsLookup: (() => void) | null = null

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

    const deployRes = await execa(deployScriptPath, [], {
      cwd: this.testDir,
      env: scriptEnv,
      reject: false,
      stderr: 'inherit',
    })

    if (deployRes.exitCode !== 0) {
      throw new Error(
        `Custom deploy script failed: ${deployRes.stdout} ${deployRes.stderr} (${deployRes.exitCode})`
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
    vercelFlags: string[]
  ): Promise<string> {
    // The fixture's `post-build` script prints the BUILD_ID, DEPLOYMENT_ID and
    // NEXT_SUPPORTS_IMMUTABLE_ASSETS markers (in that order) as the final lines
    // of the build (see `base.ts`). A deployment can report `Ready` before that
    // tail has propagated to the log query API, so `vercel inspect --logs` can
    // return a truncated prefix that stops before the markers. Gate on the
    // last-printed marker so a partial read can't slip into the parser, and
    // re-query until it appears.
    const maxAttempts = 20
    const retryDelayMs = 3000
    let output = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const buildLogs = await execa(
        'vercel',
        ['inspect', '--logs', url, ...vercelFlags],
        {
          env: vercelEnv,
          reject: false,
        }
      )
      if (buildLogs.exitCode !== 0) {
        throw new Error(`Failed to get build output logs: ${buildLogs.stderr}`)
      }
      // Build logs are piped to stderr, so combine both streams.
      output = buildLogs.stdout + buildLogs.stderr

      if (/NEXT_SUPPORTS_IMMUTABLE_ASSETS: (.+)/.test(output)) {
        return output
      }

      if (attempt < maxAttempts) {
        require('console').log(
          `Build log markers not yet propagated for ${url} (attempt ${attempt}/${maxAttempts}); the build log tail likely hasn't propagated yet. Retrying in ${retryDelayMs}ms...`
        )
        await setTimeout(retryDelayMs)
      }
    }

    // The markers never appeared within the retry window; return the last
    // output so `parseIdsFromCliOutput` throws a descriptive error including it.
    return output
  }

  public async setup(parentSpan: Span) {
    super.setup(parentSpan)
    await super.createTestDir({ parentSpan, skipInstall: true })

    await this.writeMirrorNpmrcIfNecessary()

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
        if (buildLogs.exitCode !== 0) {
          throw new Error(
            `Failed to get build output logs: ${buildLogs.stderr}`
          )
        }
        this._cliOutput = buildLogs.stdout + buildLogs.stderr
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

    // If the token is available in the environment, use it as the token in the
    // environment.
    if (TEST_TOKEN) {
      vercelEnv.TOKEN = TEST_TOKEN
    }

    // create auth file in CI
    if (process.env.NEXT_TEST_JOB) {
      if (!TEST_TOKEN && !TEST_TEAM_NAME) {
        throw new Error(
          'Missing TEST_TOKEN and TEST_TEAM_NAME environment variables for CI'
        )
      }

      const vcConfigDir = path.join(os.homedir(), '.vercel')
      await fs.ensureDir(vcConfigDir)
      await fs.writeFile(
        path.join(vcConfigDir, 'auth.json'),
        JSON.stringify({ token: TEST_TOKEN })
      )
      vercelFlags.push('--global-config', vcConfigDir)
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

    // Add experimental feature flags

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      additionalEnv.push(
        `NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS=${process.env.__NEXT_CACHE_COMPONENTS}`
      )
    }
    if (process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS) {
      additionalEnv.push(
        `NEXT_PRIVATE_EXPERIMENTAL_CACHED_NAVIGATIONS=${process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS}`
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

    const deployRes = await execa(
      'vercel',
      [
        'deploy',
        '--build-env',
        'NEXT_PRIVATE_TEST_MODE=e2e',
        '--build-env',
        'NEXT_TELEMETRY_DISABLED=1',
        '--build-env',
        'VERCEL_NEXT_BUNDLED_SERVER=1',
        ...additionalEnv.flatMap((pair) => [
          '--env',
          pair,
          '--build-env',
          pair,
        ]),
        '--force',
        ...vercelFlags,
      ],
      {
        cwd: this.testDir,
        env: vercelEnv,
        reject: false,
        // This will print deployment information earlier to the console so we
        // don't have to wait until the deployment is complete to get the
        // inspect URL.
        stderr: 'inherit',
      }
    )

    if (deployRes.exitCode !== 0) {
      throw new Error(
        `Failed to deploy project ${deployRes.stdout} ${deployRes.stderr} (${deployRes.exitCode})`
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
    // (and `vercel deploy` can return) before its full build-log tail has
    // propagated to the log query API, so re-query until the markers appear
    // rather than failing on the first incomplete read. TODO: Combine with
    // runtime logs (via `vercel logs`)
    this._cliOutput = await this.fetchBuildLogsUntilComplete(
      this._url,
      vercelEnv,
      vercelFlags
    )

    this.parseIdsFromCliOutput()
  }

  // When preview builds are private, the deploy build installs Next.js
  // artifacts from an auth-protected route and needs credentials. The build
  // authenticates with the Vercel OIDC token that Vercel automatically
  // provides to builds (vercel-packages accepts it for allowlisted teams), so
  // we write an `.npmrc` referencing it. Referencing the environment variable
  // instead of inlining a token keeps credentials out of the uploaded
  // deployment source. Only written for private preview builds since public
  // ones need no credentials and pnpm fails when an `.npmrc` references an
  // unset environment variable.
  // TODO: pnpm >= 10.34.2 no longer expands environment variables in
  // repository .npmrc files (GHSA-3qhv-2rgh-x77r). An install command writing
  // to the user-level pnpm config (like vercel/front does) did not work with
  // `vercel deploy` and needs more investigation.
  private async writeMirrorNpmrcIfNecessary(): Promise<void> {
    const baseUrlRaw = process.env.NEXT_TEST_PREVIEW_BUILDS_BASE_URL
    const access = process.env.PREVIEW_BUILDS_ACCESS

    if (!baseUrlRaw || access !== 'private') {
      require('console').log(
        `Skipping .npmrc write for preview-builds mirror: missing base URL or preview builds are public`
      )
      return
    }

    const baseUrl = new URL(baseUrlRaw)
    // Derive the npmrc auth key from the mirror base URL: strip the scheme and
    // ensure a trailing slash so it matches requests to that registry path.
    const registryKey = `//${baseUrl.host}${baseUrl.pathname.replace(/\/?$/, '/')}`

    require('console').log(
      `Writing .npmrc for preview-builds mirror: ${registryKey}`
    )
    // Appended rather than written, because a fixture may ship its own `.npmrc`
    // (several do) and overwriting it silently drops that configuration.
    const npmrcPath = path.join(this.testDir, '.npmrc')
    const existing = (await fs.pathExists(npmrcPath))
      ? await fs.readFile(npmrcPath, 'utf8')
      : ''
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'

    await fs.writeFile(
      npmrcPath,
      `${existing}${separator}${registryKey}:_authToken=\${VERCEL_OIDC_TOKEN}\n`
    )
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
    if (customCleanupScriptPath) {
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
    // no-op as the deployment is created during setup()
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
