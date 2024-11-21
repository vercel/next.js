import { nextTestSetup } from 'e2e-utils'

// TODO: Remove skip on CI if we bump the min Node.js version.
;(process.env.NEXT_TEST_CI ? describe.skip : describe)(
  'next-config-ts - dynamic import (next.config.mts)',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should support dynamic import (next.config.mts)', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('foo')
    })
  }
)
