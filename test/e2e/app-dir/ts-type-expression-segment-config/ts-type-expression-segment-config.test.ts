import { nextTestSetup } from 'e2e-utils'

// Tests that TypeScript type expressions (`as` and `satisfies`) in route segment
// config exports are correctly recognized by the static info extractor.
//
// - App dir: `export const runtime = 'edge' as 'edge'`
// - App dir: `export const runtime = 'edge' satisfies string`
// - Pages dir: `export const config = { runtime: 'experimental-edge' } as { runtime: string }`
// - Pages dir: `export const config = { runtime: 'experimental-edge' } satisfies { runtime: string }`
describe('TypeScript type expressions in route segment config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('app directory', () => {
    it('should pick up edge runtime declared with `as` type assertion', async () => {
      const $ = await next.render$('/runtime-as')
      expect($('#runtime').text()).toBe('edge')
    })

    it('should pick up edge runtime declared with `satisfies`', async () => {
      const $ = await next.render$('/runtime-satisfies')
      expect($('#runtime').text()).toBe('edge')
    })
  })

  describe('pages directory', () => {
    it('should pick up edge runtime from config object declared with `as`', async () => {
      const $ = await next.render$('/config-as')
      expect($('#runtime').text()).toBe('edge')
    })

    it('should pick up edge runtime from config object declared with `satisfies`', async () => {
      const $ = await next.render$('/config-satisfies')
      expect($('#runtime').text()).toBe('edge')
    })
  })
})
