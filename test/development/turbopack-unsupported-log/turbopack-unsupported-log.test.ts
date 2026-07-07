import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

const reactDependencies = {
  react: '19.3.0-canary-fef12a01-20260413',
  'react-dom': '19.3.0-canary-fef12a01-20260413',
}

// This test only applies to Turbopack
;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'turbopack unsupported features log',
  () => {
    describe('no config', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures/no-config'),
        dependencies: reactDependencies,
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
        dependencies: reactDependencies,
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
        dependencies: reactDependencies,
      })

      it('should warn with next.config.js with unsupported field', async () => {
        // Warning is emitted lazily when a request is served, so we need to
        // hit the server before asserting on the CLI output.
        await next.render('/')
        await retry(async () => {
          expect(next.cliOutput).toContain('(Turbopack)')
          expect(next.cliOutput).toContain(
            'You are using configuration and/or tools that are not yet'
          )
        })
      })
    })
  }
)
