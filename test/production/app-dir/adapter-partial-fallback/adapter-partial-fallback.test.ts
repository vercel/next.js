import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

describe('adapter-partial-fallback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only preserve allowQuery for partial fallbacks that can upgrade', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const withGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/with-gsp/[slug]'
    )
    const withoutGspPrerender = outputs.prerenders.find(
      (output) => output.pathname === '/without-gsp/[slug]'
    )

    expect(withGspPrerender).toBeDefined()
    expect(withoutGspPrerender).toBeDefined()

    expect(withGspPrerender.config.partialFallback).toBe(true)
    expect(withGspPrerender.config.allowQuery).toEqual(['nxtPslug'])

    expect(withoutGspPrerender.config.partialFallback).toBeUndefined()
    expect(withoutGspPrerender.config.allowQuery).toEqual([])
  })
})
