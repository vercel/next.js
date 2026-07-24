import { getPartialPrerenderConfig } from 'next/dist/build/adapter/partial-prerender-config'
import { RenderingMode } from 'next/dist/build/rendering-mode'

describe('getPartialPrerenderConfig', () => {
  it.each([RenderingMode.STATIC, undefined])(
    'does not emit config for rendering mode %s',
    (renderingMode) => {
      expect(getPartialPrerenderConfig(renderingMode, 'static')).toBeUndefined()
    }
  )

  it('sets staticHint when a PPR route does not need request-time compute', () => {
    expect(
      getPartialPrerenderConfig(RenderingMode.PARTIALLY_STATIC, 'static')
    ).toEqual({
      staticHint: true,
    })
  })

  it.each(['blocking', 'resuming'] as const)(
    'sets staticHint to false when a PPR route uses %s compute',
    (compute) => {
      expect(
        getPartialPrerenderConfig(RenderingMode.PARTIALLY_STATIC, compute)
      ).toEqual({
        staticHint: false,
      })
    }
  )

  it('emits only the PPR capability marker when compute is unknown', () => {
    expect(
      getPartialPrerenderConfig(RenderingMode.PARTIALLY_STATIC, undefined)
    ).toEqual({})
  })
})
