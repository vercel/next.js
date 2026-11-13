import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// @force-gate dev
describe('server-stack-overflow-stack-frames', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  async function getLoggedOverflowOutput(route: string): Promise<string> {
    const outputIndex = next.cliOutput.length

    await next.fetch(route)

    let output = ''

    await retry(async () => {
      output = stripAnsi(next.cliOutput.slice(outputIndex)).replaceAll(
        '\\',
        '/'
      )
      expect(output).toContain('RangeError: Maximum call stack size exceeded')
    })

    return output
  }

  it('logs a located frame when the overflow is thrown inside React', async () => {
    const output = await getLoggedOverflowOutput('/react-internal-overflow')

    // Depending on where the stack limit is hit, the original stack may keep
    // an anonymous React frame before the application frame.
    expect(output).toContain(
      '\n    at Recursive (app/react-internal-overflow/page.tsx:2:10)'
    )
    expect(output).toContain(
      '\n  1 | function Recursive() {' +
        '\n> 2 |   return <Recursive />' +
        '\n    |          ^' +
        '\n  3 | }'
    )
    expect(
      output.match(
        /at Recursive \(app\/react-internal-overflow\/page\.tsx:2:10\)/g
      )
    ).toHaveLength(1)
  })

  // The webpack Edge VM can overflow while resolving the route module before
  // React captures an owner. Turbopack exercises the render-time overflow.
  // Edge Runtime route segments are also incompatible with Cache Components.
  // @force-gate turbopack && !cacheComponents
  it('logs a located frame when the overflow is thrown inside React on Edge', async () => {
    const output = await getLoggedOverflowOutput(
      '/react-internal-overflow-edge'
    )

    expect(output).toContain(
      '\n    at Recursive (app/react-internal-overflow-edge/page.tsx:4:10)'
    )
    expect(output).toContain(
      '\n  3 | function Recursive() {' +
        '\n> 4 |   return <Recursive />' +
        '\n    |          ^' +
        '\n  5 | }'
    )
  })

  it('logs a located frame when the overflow is thrown in application code', async () => {
    const output = await getLoggedOverflowOutput('/app-code-overflow')

    expect(output).toContain(
      'RangeError: Maximum call stack size exceeded' +
        '\n    at recurse (app/app-code-overflow/page.tsx:2:3)'
    )
    expect(output).toContain(
      '\n  1 | function recurse(n: number): number {' +
        '\n> 2 |   return recurse(n + 1)' +
        '\n    |   ^' +
        '\n  3 | }'
    )
  })

  it('preserves an original frame that has a file and line without a column', async () => {
    const output = await getLoggedOverflowOutput('/file-line-stack')

    expect(output).toContain(
      'RangeError: Maximum call stack size exceeded' +
        '\n    at fail (app/file-line-stack/page.tsx:27)'
    )
  })
})
