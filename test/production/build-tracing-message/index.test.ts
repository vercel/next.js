import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

// Only Turbopack prints these warnings
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'build-tracing-message',
  () => {
    describe('default', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('should warn when tracing all files in the project', async () => {
        const { exitCode } = await next.build()
        expect(exitCode).toBe(0)

        let output = next.cliOutput
          .slice(
            next.cliOutput.indexOf('Turbopack build encountered'),
            next.cliOutput.indexOf('✓ Compiled successfully')
          )
          .trim()

        expect(stripAnsi(output)).toMatchInlineSnapshot(`
       "Turbopack build encountered 1 warning:
       ./app/join-cwd.js:4:10
       Warning: Dynamic filesystem access causes tracing of the whole project
         2 |
         3 | export default function (f) {
       > 4 |   return path.join(process.cwd(), f)
           |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^
         5 | }
         6 |

       Static analysis determined that this filesystem access causes the whole project to be traced and included in the output.
       This is usually unintentional and leads to all source files (including the public folder) to be deployed as part of the server code.
       This can slow down deployments or lead to failures when size limits are exceeded.
       To resolve this, you can
       - make sure they are statically scoped to some subfolder: path.join(process.cwd(), 'data', bar), or
       - only use them in development, or
       - add ignore comments: path.join(/*turbopackIgnore: true*/ process.cwd(), bar), or
       - remove them.

       Import trace:
         Server Component:
           ./app/join-cwd.js
           ./app/page.js"
      `)
      })
    })

    describe('output: export', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        overrideFiles: {
          'next.config.js': `module.exports = { output: 'export' }`,
        },
      })

      it('should not warn', async () => {
        const { exitCode } = await next.build()
        expect(exitCode).toBe(0)

        expect(next.cliOutput).not.toContain(
          'Dynamic filesystem access causes tracing of the whole project'
        )
      })
    })
  }
)
