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
  private _writtenHostsLine: string | null = null

  public get buildId() {
    // get deployment ID via fetch since we can't access
    // build artifacts directly
    return this._buildId
  }

  public async setup(parentSpan: Span) {
    super.setup(parentSpan)
    await super.createTestDir({ parentSpan, skipInstall: true })

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
      additionalEnv.push(`${key}=${this.env[key]}`)
    }

    additionalEnv.push(
      `VERCEL_CLI_VERSION=${process.env.VERCEL_CLI_VERSION || 'vercel@latest'}`
    )

    // Add experimental feature flags

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      additionalEnv.push(
        `NEXT_PRIVATE_EXPERIMENTAL_CACHE_COMPONENTS=${process.env.__NEXT_CACHE_COMPONENTS}`
      )
    }

    if (process.env.IS_TURBOPACK_TEST) {
      additionalEnv.push(`IS_TURBOPACK_TEST=1`)
    }
    if (process.env.IS_WEBPACK_TEST) {
      additionalEnv.push(`IS_WEBPACK_TEST=1`)
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

    // If configured, we should configure the `/etc/hosts` file to point the
    // deployment domain to the specified proxy address.
    if (
      process.env.NEXT_TEST_PROXY_ADDRESS &&
      // Validate that the proxy address is a valid IP address.
      /^\d+\.\d+\.\d+\.\d+$/.test(process.env.NEXT_TEST_PROXY_ADDRESS)
    ) {
      this._writtenHostsLine = `${process.env.NEXT_TEST_PROXY_ADDRESS}\t${this._parsedUrl.hostname}\n`

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

  public async destroy() {
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
}
