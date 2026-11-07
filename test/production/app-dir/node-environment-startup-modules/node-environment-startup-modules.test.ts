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
})
