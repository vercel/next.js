import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// A package that a Go route imports lives outside the route directories, so
// the dev server's file watcher does not see it. Turbopack does: when the
// package starts importing next/go, the route recompiles, and Next.js adds the
// go.mod requirement that the next compile needs.
// @force-gate turbopack && !deploy
describe('next/go SDK in development', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  // @force-gate dev
  it('adds the requirement when an imported package starts using next/go', async () => {
    if (!isNextDev) return
    const response = await next.fetch('/hello')
    expect(await response.text()).toBe('plain')
    // Nothing imports the SDK yet, so go.mod is left alone.
    expect(await next.readFile('go.mod')).not.toContain('next/go')

    await next.patchFile(
      'internal/greet/greet.go',
      `package greet

import "next/go"

var _ next.ProxyOptions

func Message() string { return "sdk" }
`
    )
    // The first compile after the edit fails until go.mod requires next/go,
    // then Turbopack compiles again.
    await retry(async () => {
      expect(await (await next.fetch('/hello')).text()).toBe('sdk')
    }, 60_000)
    const goMod = await next.readFile('go.mod')
    expect(goMod).toMatch(/^require next\/go v0\.0\.0$/m)
    expect(goMod).toMatch(/^replace next\/go => \.\/\S+\/next\/go$/m)
    // The first request waits for a cold Go build of the standard library,
    // which the flake job runs several times concurrently.
  }, 240_000)
})
