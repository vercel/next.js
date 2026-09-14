import { nextTestSetup } from 'e2e-utils'
import path from 'path'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'app dir - typed-routes-with-webpack-worker',
  () => {
    describe('good-routes', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'good-routes'),
        skipStart: true,
      })

      it('builds successfully without errors', async () => {
        const { exitCode, cliOutput } = await next.build()

        expect(cliOutput).toContain('webpackBuildWorker')
        expect(exitCode).toBe(0)
        expect(cliOutput).not.toContain(`"/" is not an existing route.`)
      })
    })

    describe('bad-routes', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'bad-routes'),
        skipStart: true,
      })

      it('builds with valid errors', async () => {
        const { exitCode, cliOutput } = await next.build()

        expect(cliOutput).toContain('webpackBuildWorker')
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(`"/asdfasdfasdf" is not an existing route.`)
      })
    })
  }
)
