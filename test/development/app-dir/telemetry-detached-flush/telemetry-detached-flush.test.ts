import { existsSync, readdirSync } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'

describe.each(['enabled', 'config'])(
  'telemetry detached-flush before readiness (%s)',
  (setting) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: {
        CI: '1',
        NEXT_TELEMETRY_DEBUG: '1',
        NEXT_TELEMETRY_DISABLED: '',
        NEXT_TEST_DISABLE_TELEMETRY_IN_CONFIG: setting === 'config' ? '1' : '',
        NEXT_TEST_FAIL_DEV_STARTUP: '1',
        NODE_OPTIONS: '--require ./track-worker.cjs',
      },
    })

    it('does not flush when startup fails before telemetry settings are received', async () => {
      const { code, stderr } = await next.runCommand(['dev', next.testDir])

      expect(code).toBe(1)
      expect(stderr).toContain(
        'Intentional startup failure after config evaluation'
      )
      expect(await next.readFile('startup-config-loaded')).toBe(
        setting === 'config' ? '1' : ''
      )
      expect(existsSync(path.join(next.testDir, 'flush-worker-started'))).toBe(
        false
      )
      expect(
        findAllTelemetryEvents(stderr, 'NEXT_CLI_SESSION_STOPPED')
      ).toHaveLength(0)
      expect(existsSync(path.join(next.testDir, 'flush-loaded-config'))).toBe(
        false
      )
    })
  }
)

describe.each(['enabled', 'env', 'config'])(
  'telemetry detached-flush (%s)',
  (setting) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      env: {
        CI: '1',
        NEXT_TELEMETRY_DEBUG: '1',
        NEXT_TELEMETRY_DISABLED: '',
        NEXT_TEST_DISABLE_TELEMETRY_IN_CONFIG: setting === 'config' ? '1' : '',
        NODE_OPTIONS: '--require ./track-worker.cjs',
      },
    })

    beforeAll(async () => {
      if (setting === 'env') {
        await next.patchFile('.env', 'NEXT_TELEMETRY_DISABLED=1')
      }
      await next.start()
    })

    it('flushes on shutdown without evaluating config or spawning when disabled', async () => {
      expect(await next.render('/')).toContain('hello world')
      await next.stop('SIGTERM')

      expect(existsSync(path.join(next.testDir, 'flush-loaded-config'))).toBe(
        false
      )
      expect(existsSync(path.join(next.testDir, 'flush-worker-started'))).toBe(
        setting === 'enabled'
      )
      const events = findAllTelemetryEvents(
        next.cliOutput,
        'NEXT_CLI_SESSION_STOPPED'
      )
      expect(events).toHaveLength(setting === 'enabled' ? 1 : 0)
      const cacheDir = path.join(next.testDir, 'custom-output', 'dev', 'cache')
      expect(readdirSync(cacheDir)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^_events_/)])
      )
    })
  }
)
