import { execFileSync, spawnSync } from 'child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { delimiter, join, resolve } from 'path'
import { installNext } from './install-next'
import { execPackageManager } from './package-manager'

jest.setTimeout(30_000)

// Install the tarball into a fresh cache so workspace links cannot satisfy the CLI.
describe('published upgrade package', () => {
  const packageRoot = resolve(__dirname, '..')
  let directory: string
  let bin: string
  let env: NodeJS.ProcessEnv
  let packedFiles: string[]
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'next-upgrade-package-'))
    env = {
      ...process.env,
      NODE_PATH: '',
      NEXT_TELEMETRY_DISABLED: '1',
      npm_config_user_agent: 'npm',
      npm_config_cache: join(directory, 'cache'),
    }
    const [packed] = JSON.parse(
      execPackageManager(
        'npm',
        ['pack', packageRoot, '--json', '--ignore-scripts'],
        {
          cwd: directory,
          env,
          encoding: 'utf8',
        }
      )
    )
    packedFiles = packed.files.map((file: { path: string }) => file.path)
    writeFileSync(join(directory, 'package.json'), '{"private":true}')
    execPackageManager(
      'npm',
      [
        'install',
        join(directory, packed.filename),
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
      ],
      { cwd: directory, env, stdio: 'pipe', encoding: 'utf8' }
    )
    bin = join(directory, 'node_modules/@next/upgrade/dist/bin/next-upgrade.js')
  })
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('starts the library, help, and version without any Next installation', () => {
    const library = execFileSync(
      process.execPath,
      [
        '-e',
        `const upgrade = require('@next/upgrade'); process.stdout.write(JSON.stringify([typeof upgrade.getUpgradeReminder, typeof upgrade.formatAgentNudge, typeof upgrade.nudgeUpgradeForHuman]))`,
      ],
      { cwd: directory, env, encoding: 'utf8' }
    )
    expect(JSON.parse(library)).toEqual(['function', 'function', 'function'])

    expect(
      execFileSync(process.execPath, [bin, '--help'], {
        cwd: directory,
        env,
        encoding: 'utf8',
      })
    ).toContain('next-upgrade')
    expect(
      execFileSync(process.execPath, [bin, '--version'], {
        cwd: directory,
        env,
        encoding: 'utf8',
      }).trim()
    ).toBe(require('../package.json').version)
    const manifest = JSON.parse(
      readFileSync(
        join(directory, 'node_modules/@next/upgrade/package.json'),
        'utf8'
      )
    )
    expect(manifest.dependencies ?? {}).toEqual({})
    expect(manifest.peerDependencies ?? {}).toEqual({})
    expect(
      packedFiles.filter(
        (file) =>
          /(^|\/)(src|evals|test|\.build)\//.test(file) ||
          /\.test\.[jt]s$/.test(file)
      )
    ).toEqual([])
    expect(packedFiles).toEqual(
      expect.arrayContaining([
        'dist/guides/shared.md',
        'dist/docs/01-app/02-guides/upgrading/codemods.md',
        'dist/docs/01-app/02-guides/migrating-to-cache-components.md',
      ])
    )
  })

  it('delegates a manual upgrade to codemod and preserves the actual exit status', () => {
    const runner = join(directory, 'runner')
    mkdirSync(runner)
    const script = join(runner, 'capture.js')
    const result = join(directory, 'command.json')
    writeFileSync(
      script,
      `require('fs').writeFileSync(process.env.UPGRADE_TEST_COMMAND_PATH, JSON.stringify(process.argv.slice(2))); process.exit(19)\n`
    )
    const executable = join(
      runner,
      process.platform === 'win32' ? 'npx.cmd' : 'npx'
    )
    writeFileSync(
      executable,
      process.platform === 'win32'
        ? `@"${process.execPath}" "${script}" %*\r\n`
        : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`
    )
    chmodSync(executable, 0o755)
    const child = spawnSync(process.execPath, [bin, '--revision', '16.4.0'], {
      cwd: directory,
      env: {
        ...env,
        PATH: `${runner}${delimiter}${env.PATH}`,
        UPGRADE_TEST_COMMAND_PATH: result,
      },
      encoding: 'utf8',
    })
    expect(child.status).toBe(19)
    expect(JSON.parse(readFileSync(result, 'utf8'))).toEqual([
      '--yes',
      '@next/codemod@canary',
      'upgrade',
      '16.4.0',
    ])
  })
  it('prepares a packed agent handoff with app-installed Next and an independently resolved codemod', () => {
    mkdirSync(join(directory, 'app'))
    mkdirSync(join(directory, 'tmp'))
    const legacyApp = join(directory, 'legacy-next')
    mkdirSync(legacyApp)
    installNext(legacyApp, '13.5.11')
    symlinkSync(
      join(legacyApp, 'node_modules/next'),
      join(directory, 'node_modules/next'),
      'junction'
    )
    const preload = join(directory, 'metadata.cjs')
    writeFileSync(
      preload,
      `global.fetch = async (input) => {
      const url = String(input)
      if (url.includes('/security/advisories/bulk')) return Response.json({})
      if (url === 'https://registry.npmjs.org/@next%2fcodemod/canary') return Response.json({ version: '99.0.0-canary.42' })
      if (url === 'https://registry.npmjs.org/next/latest') return Response.json({ version: '16.4.0', engines: { node: '>=20' } })
      throw new Error('Unexpected metadata request: ' + url)
    }`
    )
    const child = spawnSync(
      process.execPath,
      ['--require', preload, bin, '--agent=latest'],
      {
        cwd: directory,
        env: {
          ...env,
          CLAUDECODE: '1',
          TMPDIR: join(directory, 'tmp'),
          TMP: join(directory, 'tmp'),
          TEMP: join(directory, 'tmp'),
        },
        encoding: 'utf8',
      }
    )
    expect(child.error).toBeUndefined()
    expect({ status: child.status, stderr: child.stderr }).toMatchObject({
      status: 0,
    })
    expect(child.stdout).toContain(
      `@next/upgrade@${require('../package.json').version} internal report-agent-upgrade`
    )
    expect(child.stdout).toContain('from Next.js 13.5.11 to 16.4.0')
    const guideDirectory = readdirSync(join(directory, 'tmp')).find(
      (file: string) => file.startsWith('next-upgrade-')
    )
    if (!guideDirectory) {
      throw new Error('The packed CLI did not create its upgrade guides.')
    }
    expect(
      readFileSync(
        join(directory, 'tmp', guideDirectory, 'upgrade/different-major.md'),
        'utf8'
      )
    ).toContain('@next/codemod@99.0.0-canary.42 upgrade 16.4.0')
    const report = spawnSync(
      process.execPath,
      [
        bin,
        'internal',
        'report-agent-upgrade',
        'acfdca44-4753-4022-9cc5-afdc19d6f56e',
        'success',
      ],
      { cwd: directory, env, encoding: 'utf8' }
    )
    expect({ status: report.status, stderr: report.stderr }).toMatchObject({
      status: 0,
    })
  })
})
