import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

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

// The edge runtime sandbox applies the error inspect patch to every context
// that it creates. A server that has edge code must have loaded the patch
// before its first edge request, so that this request doesn't pay for it.
describe('node-environment-startup-modules with an edge route', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
      // The test does not request this route, so the server has not run any
      // edge code when it reports its modules.
      'pages/api/edge.ts': `
        export const config = { runtime: 'edge' }

        export default function handler() {
          return new Response('edge')
        }
      `,
    },
  })

  it('should load the error inspect patch at startup', async () => {
    const res = await next.fetch('/api/loaded-modules')
    expect(res.status).toBe(200)
    const loaded: string[] = await res.json()

    // The sandbox imports the patch as well. It must not be what loaded it.
    expect(
      loaded.filter((id) => id.startsWith('next/dist/server/web/sandbox/'))
    ).toEqual([])

    expect(loaded).toContain('next/dist/server/patch-error-inspect.js')
  })
})
