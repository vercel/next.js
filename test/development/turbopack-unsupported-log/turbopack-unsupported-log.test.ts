import { nextTestSetup } from 'e2e-utils'
import path from 'path'

// This test only applies to Turbopack
;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'turbopack unsupported features log',
  () => {
    describe('no config', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/no-config'),
      })

      it('should not warn by default', async () => {
        const html = await next.render('/')
        expect(html).toContain('hello world')
        expect(next.cliOutput).toContain('(Turbopack)')
        expect(next.cliOutput).not.toContain(
          'You are using configuration and/or tools that are not yet'
        )
      })
    })

    describe('empty config', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/empty-config'),
      })

      it('should not warn with empty next.config.js', async () => {
        const html = await next.render('/')
        expect(html).toContain('hello world')
        expect(next.cliOutput).toContain('(Turbopack)')
        expect(next.cliOutput).not.toContain(
          'You are using configuration and/or tools that are not yet'
        )
      })
    })

    describe('unsupported config', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/unsupported-config'),
      })

      it('should warn with next.config.js with unsupported field', async () => {
        expect(next.cliOutput).toContain('(Turbopack)')
        expect(next.cliOutput).toContain(
          'You are using configuration and/or tools that are not yet'
        )
      })
    })
  }
)
