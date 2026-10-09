import { pathToFileURL } from 'url'
import { execFileSync } from 'child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { installNext } from './install-next'

jest.setTimeout(30_000)
// Each isolated install exercises its actual config, environment, and consent graph.
it.each(['13.5.11', '15.5.0', '16.0.0', 'workspace'])(
  'uses the installed %s graph for config, environment, and result reporting',
  (version) => {
    const directory = mkdtempSync(join(tmpdir(), 'next-upgrade-compatibility-'))
    try {
      mkdirSync(join(directory, 'node_modules'))
      writeFileSync(join(directory, 'package.json'), '{"private":true}')
      if (version === 'workspace') {
        symlinkSync(
          dirname(require.resolve('next/package.json')),
          join(directory, 'node_modules/next'),
          'junction'
        )
      } else {
        installNext(directory, version)
      }
      cpSync(
        join(__dirname, 'fixtures/next-compatibility/next.config.js'),
        join(directory, 'next.config.js')
      )
      writeFileSync(
        join(directory, '.env'),
        'NEXT_UPGRADE_COMPAT_VALUE=fixture\n'
      )
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'development',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_TELEMETRY_DEBUG: '',
        XDG_CONFIG_HOME: join(directory, 'preferences'),
      }
      delete env.NEXT_UPGRADE_COMPAT_VALUE
      const output = execFileSync(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          join(__dirname, 'fixtures/next-compatibility/probe.ts'),
        ],
        {
          cwd: directory,
          env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      const line = output
        .split('\n')
        .find((value) => value.startsWith('UPGRADE_COMPAT_RESULT='))
      expect(line).toBeDefined()
      const result = JSON.parse(line!.slice('UPGRADE_COMPAT_RESULT='.length))
      expect(result).toMatchObject({
        version:
          version === 'workspace'
            ? require('next/package.json').version
            : version,
        environmentVersion:
          version === 'workspace'
            ? require('next/package.json').version
            : version,
        distDir: 'upgrade-output',
        rawPolicy: 'latest',
        futureDistDir: 'upgrade-output',
        loadedEnvironment: 'fixture',
        restoredEnvironment: true,
        consent: false,
      })
      expect(result.recorded).toEqual({ isFulfilled: true, isRejected: false })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
