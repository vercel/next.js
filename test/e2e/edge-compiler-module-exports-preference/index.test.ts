import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, shouldRunTurboDevTest } from 'next-test-utils'

describe('Edge compiler module exports preference', () => {
  let next: NextInstance

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
        'my-lib/package.json': JSON.stringify({
          name: 'my-lib',
          version: '1.0.0',
          main: 'index.js',
          browser: 'browser.js',
        }),
        'my-lib/index.js': `module.exports = "Node.js"`,
        'my-lib/browser.js': `module.exports = "Browser"`,
      },
      packageJson: {
        scripts: {
          setup: `cp -r ./my-lib ./node_modules`,
          build: 'yarn setup && next build',
          dev: `yarn setup && next ${
            shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
          }`,
          start: 'next start',
        },
      },
      startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
      buildCommand: 'yarn build',
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
