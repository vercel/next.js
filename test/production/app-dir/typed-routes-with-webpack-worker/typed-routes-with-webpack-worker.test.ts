import { nextBuild } from 'next-test-utils'
import path from 'path'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'app dir - typed-routes-with-webpack-worker',
  () => {
    it('builds successfully without errors', async () => {
      const output = await nextBuild(
        path.join(__dirname, 'good-routes'),
        undefined,
        {
          stdout: true,
          stderr: true,
        }
      )

      // check for the experimental flag warning
      expect(output.stdout).toContain('webpackBuildWorker')
      // should have a successful build
      expect(output.code).toBe(0)
      // with no errors
      expect(output.stderr).not.toContain(`"/" is not an existing route.`)
    })

    it('builds with valid errors', async () => {
      const output = await nextBuild(
        path.join(__dirname, 'bad-routes'),
        undefined,
        {
          stdout: true,
          stderr: true,
        }
      )

      // check for the experimental flag warning
      expect(output.stdout).toContain('webpackBuildWorker')
      // should have a failed build
      expect(output.code).toBe(1)
      // with correct error
      expect(output.stderr).toContain(
        `"/asdfasdfasdf" is not an existing route.`
      )
    })
  }
)
