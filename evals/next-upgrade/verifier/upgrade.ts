import { createRequire } from 'node:module'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import {
  verifyBrowser,
  verifyHttp,
} from '../apps/member-dashboard/behavior.spec'

export function upgradeChecks(target: string): void {
  const app = process.env.NEXT_UPGRADE_VERIFY_APP
  const reportPath = process.env.NEXT_UPGRADE_VERIFY_REPORT
  if (!app || !reportPath) {
    throw new Error('Missing trusted verification inputs')
  }
  const checks: Record<string, { passed: boolean; evidence: string }> = {}
  let installError: string | null = null
  let server: ReturnType<typeof spawn> | null = null
  let buildPassed = false
  const url = 'http://127.0.0.1:3000'
  const manifest = () =>
    JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  const lockfile = () =>
    JSON.parse(readFileSync(join(app, 'package-lock.json'), 'utf8'))
  const run = (cmd: string, args: string[], timeout: number) =>
    execFileSync(cmd, args, {
      cwd: app,
      encoding: 'utf8',
      timeout,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'production',
      },
      maxBuffer: 10 * 1024 * 1024,
    })
  const check = (name: string, body: () => unknown | Promise<unknown>) => {
    test(
      name,
      async () => {
        try {
          const evidence = await body()
          checks[name] = {
            passed: true,
            evidence: typeof evidence === 'string' ? evidence : 'Verified',
          }
        } catch (error) {
          checks[name] = {
            passed: false,
            evidence: error instanceof Error ? error.message : String(error),
          }
          throw error
        } finally {
          writeFileSync(
            reportPath,
            JSON.stringify({ checks, installError }, null, 2)
          )
        }
      },
      600000
    )
  }

  // npm ci preserves the delivered lockfile. No agent-written script owns a gate.
  beforeAll(() => {
    try {
      run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], 300000)
    } catch (error) {
      installError = error instanceof Error ? error.message : String(error)
    }
  }, 330000)
  afterAll(() => {
    if (server) {
      server.kill('SIGTERM')
    }
  })
  check('manifest', () => {
    const semver = createRequire(join(app, 'package.json'))(
      'next/dist/compiled/semver'
    )
    const requested = manifest().dependencies.next
    expect(semver.satisfies(target, requested)).toBe(true)
    expect(semver.minVersion(requested)?.version).toBe(target)
  })
  check('lockfile', () => {
    const lock = lockfile()
    // Root dependency metadata can retain ^target while package.json pins target.
    // npm ci and the resolved package entry establish installation consistency.
    expect(lock.packages['node_modules/next'].version).toBe(target)
    expect(installError).toBeNull()
  })
  check('installed-version', () => {
    expect(installError).toBeNull()
    expect(
      run('node', ['-p', "require('next/package.json').version"], 10000).trim()
    ).toBe(target)
  })
  check('typecheck', () => {
    expect(installError).toBeNull()
    expect(manifest().scripts.typecheck).toBeTruthy()
    const effective = JSON.parse(
      run('node', ['node_modules/typescript/bin/tsc', '--showConfig'], 10000)
    )
    expect(effective.compilerOptions.noCheck === true).toBe(false)
    expect(effective.compilerOptions.strict).toBe(true)
    // showConfig lists roots only; imported app/lib files still belong to the
    // checked program and must count toward source coverage.
    const included = new Set(
      run('node', ['node_modules/typescript/bin/tsc', '--listFilesOnly'], 90000)
        .trim()
        .split(/\r?\n/)
        .map((file) => resolve(app, file))
    )
    const covered = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name)
        if (entry.isDirectory()) {
          covered(file)
        } else if (/\.tsx?$/.test(entry.name)) {
          expect(included.has(file)).toBe(true)
        }
      }
    }
    for (const directory of ['app', 'lib']) {
      if (existsSync(join(app, directory))) {
        covered(join(app, directory))
      }
    }
    return run('node', ['node_modules/typescript/bin/tsc', '--noEmit'], 90000)
  })
  check('build', () => {
    expect(installError).toBeNull()
    expect(manifest().scripts.build).toBeTruthy()
    const output = run(
      'node',
      ['node_modules/next/dist/bin/next', 'build'],
      480000
    )
    buildPassed = true
    return output
  })
  const start = async () => {
    expect(buildPassed).toBe(true)
    if (!server) {
      server = spawn(
        'node',
        [
          'node_modules/next/dist/bin/next',
          'start',
          '--hostname',
          '127.0.0.1',
          '--port',
          '3000',
        ],
        {
          cwd: app,
          env: {
            ...process.env,
            NEXT_TELEMETRY_DISABLED: '1',
            NODE_ENV: 'production',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      server.on('error', (error) => {
        throw error
      })
      server.stdout?.on('data', (data) => process.stdout.write(data))
      server.stderr?.on('data', (data) => process.stderr.write(data))
      await vi.waitFor(
        async () => {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(2000),
          })
          expect(response.status).toBe(200)
        },
        { timeout: 30000, interval: 300 }
      )
    }
  }
  check('http', async () => {
    await start()
    await verifyHttp(url)
  })
  check('browser', async () => {
    await start()
    await verifyBrowser(url)
  })
}
