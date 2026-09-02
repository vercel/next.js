import * as path from 'path'
import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { getRedboxSource, retry } from 'next-test-utils'

function setup(subDir: string) {
  return nextTestSetup({
    files: path.join(__dirname, 'fixtures'),
    subDir,
  })
}

async function assertSymbolicatedSSRError(
  next: ReturnType<typeof setup>['next']
) {
  const outputIndex = next.cliOutput.length
  const browser = await next.browser('/ssr-throw')

  await retry(() => {
    expect(next.cliOutput.slice(outputIndex)).toContain('Error: ssr-throw')
  })

  const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
  expect(cliOutput).toContain(
    '⨯ Error: ssr-throw' +
      '\n    at throwError (app/ssr-throw/Thrower.js:4:9)' +
      '\n    at Thrower (app/ssr-throw/Thrower.js:8:3)'
  )

  let redboxSource: string | null = null
  await retry(async () => {
    redboxSource = await getRedboxSource(browser)
    expect(redboxSource).not.toBeNull()
  })
  expect(redboxSource).toContain('app/ssr-throw/Thrower.js (4:9) @ throwError')
  expect(redboxSource).toContain("throw new Error('ssr-throw')")
}

// Symbolication must work in project directories whose absolute path
// contains characters that need percent-encoding in URLs.
describe('special project paths', () => {
  describe('in "space dir"', () => {
    const { next } = setup('space dir')

    it('symbolicates thrown SSR errors', async () => {
      await assertSymbolicatedSSRError(next)
    })
  })

  describe('in "ünïcode-dir"', () => {
    const { next } = setup('ünïcode-dir')

    it('symbolicates thrown SSR errors', async () => {
      await assertSymbolicatedSSRError(next)
    })
  })

  describe('in "bracket [dir]"', () => {
    const { next } = setup('bracket [dir]')

    it('symbolicates thrown SSR errors', async () => {
      await assertSymbolicatedSSRError(next)
    })
  })

  // TODO(veil): The remaining directory names need React's fake stack frame
  // filename virtualization to round-trip losslessly. When they start
  // passing, `it.failing` will fail and remind us to promote them.

  describe('in "percent%20dir"', () => {
    const { next } = setup('percent%20dir')

    it.failing('symbolicates thrown SSR errors', async () => {
      await assertSymbolicatedSSRError(next)
    })
  })

  describe('in "hash#dir"', () => {
    const { next } = setup('hash#dir')

    it.failing('symbolicates thrown SSR errors', async () => {
      await assertSymbolicatedSSRError(next)
    })
  })
})
