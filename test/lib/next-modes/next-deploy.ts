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
import { Span } from 'next/src/trace'

export class NextDeployInstance extends NextInstance {
  private _cliOutput: string
  private _buildId: string

  public get buildId() {
    // get deployment ID via fetch since we can't access
    // build artifacts directly
    return this._buildId
  }

  public async setup(parentSpan: Span) {
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

    const vercelFlags = []

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
      }
    )

    if (linkRes.exitCode !== 0) {
      throw new Error(
        `Failed to link project ${linkRes.stdout} ${linkRes.stderr} (${linkRes.exitCode})`
      )
    }
    require('console').log(`Deploying project at ${this.testDir}`)

    const additionalEnv = []

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
      }
    )

    if (deployRes.exitCode !== 0) {
      throw new Error(
        `Failed to deploy project ${linkRes.stdout} ${linkRes.stderr} (${linkRes.exitCode})`
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

    // Use the vercel logs command to get the CLI output from the build.
    const logs = await execa(
      'vercel',
      ['logs', this._url, '--output', 'raw', ...vercelFlags],
      {
        env: vercelEnv,
      }
    )
    if (logs.exitCode !== 0) {
      throw new Error(`Failed to get build output logs: ${logs.stderr}`)
    }

    // Use the stdout from the logs command as the CLI output. The CLI will
    // output other unrelated logs to stderr.
    this._cliOutput = logs.stdout
  }

  public get cliOutput() {
    return this._cliOutput || ''
  }

  public async start() {
    // no-op as the deployment is created during setup()
  }

  public async patchFile(filename: string, content: string): Promise<void> {
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
