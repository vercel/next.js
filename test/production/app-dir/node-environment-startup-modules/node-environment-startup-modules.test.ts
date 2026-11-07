import { execFileSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'

// The Node.js environment setup runs before anything else in every server
// process, so everything it loads is paid for on every start. These modules
// are only needed in specific situations and must not be loaded up front.
const MODULES_NOT_NEEDED_AT_STARTUP = [
  // Error inspection is only patched when source maps are enabled.
  'next/dist/server/patch-error-inspect.js',
  'next/dist/compiled/source-map/',
  // Only the development server writes logs to a file.
  'next/dist/server/dev/browser-logs/file-logger.js',
  // Only used once a prerender or a staged render observes synchronous IO.
  'next/dist/server/app-render/dynamic-rendering.js',
  'next/dist/server/app-render/staged-rendering.js',
  'next/dist/server/dynamic-rendering-utils.js',
]

// A server entry that does not go through `next start` only runs the
// environment setup before it loads a route. `next start` loads these modules
// for its own output, so they can only be checked in such a process.
const MODULES_NOT_NEEDED_BY_ENVIRONMENT_SETUP = [
  ...MODULES_NOT_NEEDED_AT_STARTUP,
  // Only used once a log is dimmed.
  'next/dist/lib/picocolors.js',
]

describe('node-environment-startup-modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not load modules that a production server does not use at startup', async () => {
    const res = await next.fetch('/api/loaded-modules')
    expect(res.status).toBe(200)
    const loaded: string[] = await res.json()

    // If the environment setup is renamed or stops being a separate file, the
    // check below would pass for the wrong reason.
    expect(loaded).toContain('next/dist/server/node-environment.js')

    expect(
      loaded.filter((id) =>
        MODULES_NOT_NEEDED_AT_STARTUP.some((unused) => id.startsWith(unused))
      )
    ).toEqual([])
  })

  it('should load what a dimmed log needs on the first dimmed log', async () => {
    // Runs the environment setup on its own, then prints a dimmed log.
    const script = `
      const loaded = () =>
        Object.keys(require.cache)
          .map((id) => id.replace(/\\\\/g, '/'))
          .filter((id) => id.includes('/next/dist/'))
          .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1))
      require('next/dist/build/adapter/setup-node-env.external')
      const atStartup = loaded()
      const { consoleAsyncStorage } = require('next/dist/server/app-render/console-async-storage.external')
      consoleAsyncStorage.run({ dim: true }, () => console.log('dimmed log'))
      process.stdout.write(JSON.stringify({ atStartup, afterDimmedLog: loaded() }))
    `
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      FORCE_COLOR: '1',
    }
    delete env.NO_COLOR
    const stdout = execFileSync(process.execPath, ['-e', script], {
      cwd: next.testDir,
      env,
      encoding: 'utf8',
    })
    const [dimmedLog, report] = stdout.split('\n')
    const { atStartup, afterDimmedLog } = JSON.parse(report) as {
      atStartup: string[]
      afterDimmedLog: string[]
    }

    expect(atStartup).toContain('next/dist/server/node-environment.js')
    expect(
      atStartup.filter((id) =>
        MODULES_NOT_NEEDED_BY_ENVIRONMENT_SETUP.some((unused) =>
          id.startsWith(unused)
        )
      )
    ).toEqual([])

    expect(dimmedLog).toContain('\x1b[2mdimmed log')
    expect(afterDimmedLog).toContain('next/dist/lib/picocolors.js')
  })
})
