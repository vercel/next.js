import { nextTestSetup } from 'e2e-utils'

describe('hashbang', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('first-line hashbang (#!) parse', () => {
    it('should work for .js files', async () => {
      const html = await next.render('/')
      expect(html).toMatch('JS: 123')
    })

    it('should work for .mjs files', async () => {
      const html = await next.render('/')
      expect(html).toMatch('MJS: 456')
    })

    it('should work for .cjs files', async () => {
      const html = await next.render('/')
      expect(html).toMatch('CJS: 789')
    })
  })
})
