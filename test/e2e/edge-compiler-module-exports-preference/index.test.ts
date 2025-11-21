import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('Edge compiler module exports preference', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    // this test is skipped when deployed because it manually creates a package in the node_modules directory
    // which is unsupported
    it('should skip next deploy', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server';
          import lib from 'my-lib';

          export default (req) => {
            return NextResponse.next({
              headers: {
                'x-imported': lib
              }
            })
          }
        `,
        'node_modules/my-lib/package.json': JSON.stringify({
          name: 'my-lib',
          version: '1.0.0',
          main: 'index.js',
          browser: 'browser.js',
        }),
        'node_modules/my-lib/index.js': `module.exports = "Node.js"`,
        'node_modules/my-lib/browser.js': `module.exports = "Browser"`,
      },
      packageJson: {
        scripts: {
          build: 'next build',
          dev: 'next dev',
          start: 'next start',
        },
      },
      installCommand: 'pnpm i',
      startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
      buildCommand: 'pnpm run build',
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('favors the browser export', async () => {
    const response = await fetchViaHTTP(next.url, '/')
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'x-imported': 'Browser',
    })
  })
})
