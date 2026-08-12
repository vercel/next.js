import os from 'os'
import path from 'path'
import execa from 'execa'
import fs from 'fs-extra'
import { NextInstance } from './base'
import {
  TEST_PROJECT_NAME,
  TEST_TEAM_NAME,
  TEST_TOKEN,
} from '../../../scripts/reset-project.mjs'
import fetch from 'node-fetch'
import { Span } from 'next/dist/trace'

export class NextDeployInstance extends NextInstance {
  private _cliOutput: string
  private _buildId: string

  public get buildId() {
    // get deployment ID via fetch since we can't access
    // build artifacts directly
    return this._buildId
  }

  public async setup(parentSpan: Span) {
    super.setup(parentSpan)
    await super.createTestDir({ parentSpan, skipInstall: true })

    await this.writeMirrorNpmrcIfNecessary()
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

    // If the team name is available in the environment, use it as the scope.
    if (TEST_TEAM_NAME) {
      vercelFlags.push('--scope', TEST_TEAM_NAME)
    }

    const vercelEnv = { ...process.env }

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
      ['link', '-p', TEST_PROJECT_NAME, '--yes', ...vercelFlags],
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
      additionalEnv.push('--build-env')
      additionalEnv.push(`${key}=${this.env[key]}`)
      additionalEnv.push('--env')
      additionalEnv.push(`${key}=${this.env[key]}`)
    }

    additionalEnv.push('--build-env')
    additionalEnv.push(
      `VERCEL_CLI_VERSION=${process.env.VERCEL_CLI_VERSION || 'vercel@latest'}`
    )

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
        ...additionalEnv,
        '--force',
        ...vercelFlags,
      ],
      {
        cwd: this.testDir,
        env: vercelEnv,
        reject: false,
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

    require('console').log(`Deployment URL: ${this._url}`)
    const buildIdUrl = `${this._url}${
      this.basePath || ''
    }/_next/static/__BUILD_ID`

    const buildIdRes = await fetch(buildIdUrl)

    if (!buildIdRes.ok) {
      require('console').error(
        `Failed to load buildId ${buildIdUrl} (${buildIdRes.status})`
      )
    }
    this._buildId = (await buildIdRes.text()).trim()

    require('console').log(`Got buildId: ${this._buildId}`)

    // Use the vercel inspect command to get the CLI output from the build.
    const buildLogs = await execa(
      'vercel',
      ['inspect', '--logs', this._url, ...vercelFlags],
      {
        env: vercelEnv,
        reject: false,
      }
    )
    if (buildLogs.exitCode !== 0) {
      throw new Error(`Failed to get build output logs: ${buildLogs.stderr}`)
    }

    // Use the stdout from the logs command as the CLI output. The CLI will
    // output other unrelated logs to stderr.

    // TODO: Combine with runtime logs (via `vercel logs`)
    // Build logs seem to be piped to stderr, so we'll combine them to make sure we get all the logs.
    this._cliOutput = buildLogs.stdout + buildLogs.stderr
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
    await fs.writeFile(
      path.join(this.testDir, '.npmrc'),
      `${registryKey}:_authToken=\${VERCEL_OIDC_TOKEN}\n`
    )
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
}
