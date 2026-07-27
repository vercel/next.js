import { nextTestSetup } from 'e2e-utils'

describe('TypeScript type expressions in route segment config', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  describe('app directory', () => {
    it('should pick up maxDuration declared with `as` type assertion', async () => {
      const $ = await next.render$('/as')
      expect($('main').text()).toBe('hello')
    })

    it('should pick up maxDuration declared with `as const` assertion', async () => {
      const $ = await next.render$('/as-const')
      expect($('main').text()).toBe('hello')
    })

    it('should pick up maxDuration declared with `satisfies`', async () => {
      const $ = await next.render$('/satisfies')
      expect($('main').text()).toBe('hello')
    })
  })

  describe('pages directory', () => {
    it('should pick up maxDuration from config object declared with `as`', async () => {
      const $ = await next.render$('/config-as')
      expect($('main').text()).toBe('hello')
    })

    it('should pick up maxDuration from config object declared with `as const`', async () => {
      const $ = await next.render$('/config-as-const')
      expect($('main').text()).toBe('hello')
    })

    it('should pick up maxDuration from config object declared with `satisfies`', async () => {
      const $ = await next.render$('/config-satisfies')
      expect($('main').text()).toBe('hello')
    })
  })

  if (isNextStart) {
    it('should parse the config correctly', async () => {
      const config = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(config).toMatchInlineSnapshot(`
       {
         "functions": {
           "/as": {
             "maxDuration": 1000,
           },
           "/as-const": {
             "maxDuration": 1000,
           },
           "/config-as": {
             "maxDuration": 1000,
           },
           "/config-as-const": {
             "maxDuration": 1000,
           },
           "/config-satisfies": {
             "maxDuration": 1000,
           },
           "/satisfies": {
             "maxDuration": 1000,
           },
         },
         "version": 1,
       }
      `)
    })
  }
})
