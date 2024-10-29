import { nextTestSetup } from 'e2e-utils'

describe('dynamic-io-with-otel', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not log an error for accessing `Math.random()`', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    // @vercel/otel uses `Math.random()` to generate span IDs. This should not
    // trigger an error during prerendering.
    expect(next.cliOutput).not.toContain(
      'Error: Route "/" used `Math.random()` outside of `"use cache"` and without explicitly calling `await connection()` beforehand.'
    )
  })
})
