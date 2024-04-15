import { createNextDescribe } from 'e2e-utils'

// Tests Babel, not needed for Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)('with babel', () => {
  createNextDescribe(
    'with babel',
    {
      files: __dirname,
      skipDeployment: true,
    },
    ({ next, isNextStart }) => {
      it('should support babel in app dir', async () => {
        const $ = await next.render$('/')
        expect($('h1').text()).toBe('hello')
      })

      if (isNextStart) {
        it('should contain og package files in middleware', async () => {
          const middleware = await next.readFile('.next/server/middleware.js')
          // @vercel/og default font should be bundled
          expect(middleware).not.toContain('noto-sans-v27-latin-regular.ttf')
        })
      }
    }
  )
})
