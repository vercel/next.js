import { nextTestSetup } from 'e2e-utils'

// I am temporarily deactivating these tests. We turned off the dev time warning but will reintroduce it when we add in dev-time prerendering.
// The tests will likely have to change but I'd like to keep the fixture and assertions as a starting point.
describe.skip('dynamic-requests warnings', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let cliIndex = 0

  it('warns on reading the current time in the prerender portion of a dev render', async () => {
    await next.fetch('/platform/render/time')
    expect(next.cliOutput).not.toContain(
      'Route "/platform/prerender/time" used `Date()`'
    )
    expect(next.cliOutput).not.toContain(
      'Route "/platform/prerender/time" used `new Date()`'
    )
    expect(next.cliOutput).not.toContain(
      'Route "/platform/prerender/time" used `Date.now()`'
    )
    expect(next.cliOutput).not.toContain(
      'Route "/platform/prerender/time" used `performance.now()`'
    )

    await next.fetch('/platform/prerender/time')
    expect(next.cliOutput).toContain(
      'Route "/platform/prerender/time" used `Date()` instead of using `performance` or without explicitly calling `await connection()` beforehand.'
    )
    expect(next.cliOutput).toContain(
      'Route "/platform/prerender/time" used `new Date()` instead of using `performance` or without explicitly calling `await connection()` beforehand.'
    )
    expect(next.cliOutput).toContain(
      'Route "/platform/prerender/time" used `Date.now()` instead of using `performance` or without explicitly calling `await connection()` beforehand.'
    )
    expect(next.cliOutput).not.toContain(
      'Route "/platform/prerender/time" used `performance.now()`'
    )
    cliIndex = next.cliOutput.length
  })

  it('warns on reading the random numbers in the prerender portion of a dev render', async () => {
    await next.fetch('/platform/render/random')
    expect(next.cliOutput.slice(cliIndex)).not.toContain(
      'Route /platform/prerender/random used `Math.random()`'
    )

    await next.fetch('/platform/prerender/random')
    expect(next.cliOutput.slice(cliIndex)).toContain(
      'Route /platform/prerender/random used `Math.random()` outside of `"use cache"` and without explicitly calling `await connection()` beforehand.'
    )
    cliIndex = next.cliOutput.length
  })

  it('warns on reading the random values from web crypto APIs in the prerender portion of a dev render', async () => {
    await next.fetch('/platform/render/web-crypto')
    expect(next.cliOutput.slice(cliIndex)).not.toContain(
      'Route /platform/prerender/web-crypto used `crypto.getRandomValues()`'
    )
    expect(next.cliOutput.slice(cliIndex)).not.toContain(
      'Route /platform/prerender/web-crypto used `crypto.randomUUID()`'
    )

    await next.fetch('/platform/prerender/web-crypto')
    expect(next.cliOutput.slice(cliIndex)).toContain(
      'Route /platform/prerender/web-crypto used `crypto.getRandomValues()` outside of `"use cache"` and without explicitly calling `await connection()` beforehand.'
    )
    expect(next.cliOutput.slice(cliIndex)).toContain(
      'Route /platform/prerender/web-crypto used `crypto.randomUUID()` outside of `"use cache"` and without explicitly calling `await connection()` beforehand.'
    )
    cliIndex = next.cliOutput.length
  })

  it('warns on reading the random values from node crypto APIs in the prerender portion of a dev render', async () => {
    await next.fetch('/platform/render/node-crypto')
    expect(next.cliOutput.slice(cliIndex)).not.toContain(
      "Route /platform/prerender/node-crypto used `require('node:crypto').randomInt(min, max)`"
    )

    await next.fetch('/platform/prerender/node-crypto')
    expect(next.cliOutput.slice(cliIndex)).toContain(
      'Route /platform/prerender/node-crypto used `require(\'node:crypto\').randomInt(min, max)` outside of `"use cache"` and without explicitly calling `await connection()` beforehand.'
    )
    cliIndex = next.cliOutput.length
  })
})
