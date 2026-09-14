import { randomUUID } from 'crypto'
import { nextTestSetup } from 'e2e-utils'
import escapeStringRegexp from 'escape-string-regexp'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// Explicitly don't mix route handlers with pages in this test app, to make sure
// that this also works in isolation.
describe('use-cache-route-handler-only', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should cache results in node route handlers', async () => {
    const response = await next.fetch('/node')
    const { date1, date2 } = await response.json()

    expect(date1).toBe(date2)
  })

  if (!isNextDeploy) {
    // In deploy mode, concurrent requests could hit different lambdas.
    it('should dedupe concurrent cache invocations in route handlers', async () => {
      // Restart to ensure a cold server. Without this, prior test activity
      // can affect request timing enough for the concurrent requests to no
      // longer overlap reliably.
      await next.stop()
      await next.start()

      const [{ rand: first }, { rand: second }] = await Promise.all([
        next.fetch('/node-dynamic').then((response) => response.json()),
        next.fetch('/node-dynamic').then((response) => response.json()),
      ])

      expect(first).toBe(second)
    })
  }

  it('refreshes cached data after tag revalidation', async () => {
    const path = `/tag-revalidation?key=${randomUUID()}`
    const read = () => next.fetch(path).then((response) => response.json())
    const initial = await read()
    expect(initial).toBeDateString()
    expect(await read()).toBe(initial)

    expect((await next.fetch(path, { method: 'POST' })).status).toBe(204)
    // TODO: Restore this assertion on deploy when tag revalidation supports
    // stale-while-revalidate for remote cache entries.
    if (!isNextDeploy) {
      expect(await read()).toBe(initial)
    }

    await retry(async () => {
      const fresh = await read()
      expect(fresh).toBeDateString()
      expect(new Date(fresh)).toBeAfter(new Date(initial))
    })
  })

  // @force-gate !deploy
  it('dedupes tag revalidation across requests while generation is pending', async () => {
    const key = randomUUID()
    const path = `/tag-revalidation?key=${key}`
    const read = () => next.fetch(path).then((response) => response.json())
    const initial = await read()
    expect(initial).toBeDateString()
    await retry(() => {
      expect(next.cliOutput).toContain(`tag-revalidation: generated ${key}`)
    })
    const outputIndex = next.cliOutput.length
    const getOutput = () =>
      stripAnsi(next.cliOutput.slice(outputIndex))
        .split('\n')
        .filter((line) => !line.includes(' Cache '))
        .join('\n')
    const generating = `tag-revalidation: generating ${key}`
    const generated = `tag-revalidation: generated ${key}`

    expect((await next.fetch(path, { method: 'POST' })).status).toBe(204)
    expect(await read()).toBe(initial)
    await retry(() => {
      expect(getOutput()).toContain(generating)
    })
    expect(getOutput()).not.toContain(generated)
    expect(await read()).toBe(initial)

    await retry(() => {
      const output = getOutput()
      expect(output).toIncludeRepeated(escapeStringRegexp(generating), 1)
      expect(output).toIncludeRepeated(escapeStringRegexp(generated), 1)
    })
    await retry(async () => {
      const fresh = await read()
      expect(fresh).toBeDateString()
      expect(new Date(fresh)).toBeAfter(new Date(initial))
    })
    expect(getOutput()).toIncludeRepeated(escapeStringRegexp(generating), 1)
  })

  it('should be able to revalidate prerendered route handlers', async () => {
    const response1 = await next.fetch('/node')
    const { date1: date1a } = await response1.json()

    const attemptOnce: typeof retry = async (fn) => fn()
    const retryIfDeployed = isNextDeploy ? retry : attemptOnce

    // Revalidation on Vercel isn't instant.
    await retryIfDeployed(async () => {
      // Revalidate the prerendered response.
      await next.fetch('/revalidate', { method: 'POST' })

      // Fetch the response again. This should trigger a blocking revalidation.
      const response2 = await next.fetch('/node')
      expect(response2.status).toBe(200)

      const { date1: date1b } = await response2.json()
      expect(date1a).not.toBe(date1b)
    })
  })
})
