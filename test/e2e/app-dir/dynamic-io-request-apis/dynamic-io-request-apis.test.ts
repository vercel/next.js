import { nextTestSetup } from 'e2e-utils'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

const stackStart = /\s+at /

function createExpectError(cliOutput: string) {
  let cliIndex = 0
  return function expectError(
    containing: string,
    withStackContaining?: string
  ) {
    const initialCliIndex = cliIndex
    let lines = cliOutput.slice(cliIndex).split('\n')

    let i = 0
    while (i < lines.length) {
      let line = lines[i++] + '\n'
      cliIndex += line.length
      if (line.includes(containing)) {
        if (typeof withStackContaining !== 'string') {
          return
        } else {
          while (i < lines.length) {
            let stackLine = lines[i++] + '\n'
            if (!stackStart.test(stackLine)) {
              expect(stackLine).toContain(withStackContaining)
            }
            if (stackLine.includes(withStackContaining)) {
              return
            }
          }
        }
      }
    }

    expect(cliOutput.slice(initialCliIndex)).toContain(containing)
  }
}

describe(`Request Promises`, () => {
  describe('On Prerender Completion', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/reject-hanging-promises-static',
      skipStart: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('does not run in dev', () => {})
      return
    }

    it('should reject request APIs after the prerender is complete when it finishes naturally', async () => {
      try {
        await next.start()
      } catch {
        throw new Error('expected build not to fail for fully static project')
      }
      const expectError = createExpectError(next.cliOutput)

      if (WITH_PPR) {
        expectError(
          'Error: During prerendering, `params` rejects when the prerender is complete'
        )
      }
      expectError(
        'Error: During prerendering, `searchParams` rejects when the prerender is complete'
      )
      expectError(
        'Error: During prerendering, `cookies()` rejects when the prerender is complete'
      )
      expectError(
        'Error: During prerendering, `headers()` rejects when the prerender is complete'
      )
      expectError(
        'Error: During prerendering, `connection()` rejects when the prerender is complete'
      )
    })
  })
  describe('On Prerender Interruption', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/reject-hanging-promises-dynamic',
      skipStart: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('does not run in dev', () => {})
      return
    }

    it('should reject request APIs after the prerender is interrupted with synchronously dynamic APIs', async () => {
      try {
        await next.start()
      } catch {
        throw new Error('expected build not to fail for fully static project')
      }
      const expectError = createExpectError(next.cliOutput)

      if (WITH_PPR) {
        expectError(
          'Error: During prerendering, `params` rejects when the prerender is complete'
        )
      }
      expectError(
        'Error: During prerendering, `searchParams` rejects when the prerender is complete'
      )
      expectError(
        'Error: During prerendering, `cookies()` rejects when the prerender is complete'
      )
      expectError(
        'Error: During prerendering, `headers()` rejects when the prerender is complete'
      )
      expectError(
        'Error: During prerendering, `connection()` rejects when the prerender is complete'
      )
    })
  })
})
