import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('Using Node.js runtime APIs in Middleware has descriptive error messages', () => {
  let next: NextInstance

  beforeAll(async () => {
    process.env.NODE_JS_RUNTIME_API_TESTS = 'hello'
    next = await createNext({
      files: {
        'pages/_middleware.js': `
          import { NextResponse } from 'next/server'

          export default function middleware(req) { 
            const tag = req.headers.get('x-tag');
            console.log('[invocation] ' + tag);
            return NextResponse.json({
              'process.env.NODE_JS_RUNTIME_API_TESTS': process.env.NODE_JS_RUNTIME_API_TESTS,
              'process.cwd': process.cwd(),
            });
          } 
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('prints a warning for each incompatible API', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/',
      {},
      {
        headers: {
          'x-tag': 'warning-test',
        },
      }
    )
    const logs = getLogsForTag('warning-test', next)
    expect(logs).toContain(
      `You're using a Node.js API (process.cwd) which is not supported`
    )
    expect(response.ok).toBe(false)
  })

  it('fails the request', async () => {
    const response = await fetchViaHTTP(
      next.url,
      '/',
      {},
      {
        headers: {
          'x-tag': 'fails-the-request',
        },
      }
    )
    const logs = getLogsForTag('fails-the-request', next)
    expect(logs).toContain(`TypeError: process.cwd is not a function`)
    expect(response.ok).toBe(false)
  })
})

function getLogsForTag(tag: string, next: NextInstance) {
  const lines = next.cliOutput.split('\n')
  const startIndex = lines.findIndex((x) => x.trim() === `[invocation] ${tag}`)
  if (startIndex === -1) {
    throw new Error(`Could not find invocation for tag ${tag}`)
  }

  const linesFromIndex = lines.slice(startIndex + 1)
  const endIndex = linesFromIndex.findIndex((x) => x.trim() === `[invocation] `)

  if (endIndex === -1) {
    return linesFromIndex.join('\n')
  } else {
    return linesFromIndex.slice(0, endIndex).join('\n')
  }
}
