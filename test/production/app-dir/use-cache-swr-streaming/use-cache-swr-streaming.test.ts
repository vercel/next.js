import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const lateRevalidatesFinished = 'late revalidates promise finished for: /'

describe('use-cache-swr-streaming', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
  })

  function getOutput(outputIndex: number) {
    return stripAnsi(next.cliOutput.slice(outputIndex))
  }

  function expectLateRevalidatesAfterCacheWrite(output: string) {
    const setEndIndex = output.lastIndexOf('SlowCacheHandler::set-end')
    expect(setEndIndex).toBeGreaterThan(
      output.indexOf('SlowCacheHandler::set-start')
    )
    expect(
      output.indexOf(lateRevalidatesFinished, setEndIndex)
    ).toBeGreaterThan(setEndIndex)
  }

  it('should pass cache writes that start while streaming to waitUntil', async () => {
    let outputIndex = next.cliOutput.length
    const $1 = await next.render$('/')
    const cached1 = $1('#cached').text()
    expect(cached1).toBeDateString()

    await retry(
      () => {
        const output = getOutput(outputIndex)
        expect(output).toContain('RequestContext::waitUntil')
        expectLateRevalidatesAfterCacheWrite(output)
      },
      15_000,
      500
    )

    outputIndex = next.cliOutput.length
    const start = Date.now()
    const $2 = await next.render$('/')
    const duration = Date.now() - start
    expect($2('#cached').text()).toBe(cached1)
    expect(duration).toBeLessThan(4000)

    await retry(
      () => {
        const output = getOutput(outputIndex)
        expect(output).toContain('RequestContext::waitUntil')
        expectLateRevalidatesAfterCacheWrite(output)
      },
      15_000,
      500
    )

    const $3 = await next.render$('/')
    expect($3('#cached').text()).not.toBe(cached1)
  })
})
