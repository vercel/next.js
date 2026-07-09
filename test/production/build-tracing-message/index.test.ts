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

        const cliOutput = stripAnsi(next.cliOutput)

        // Warnings are deferred until after static generation so that
        // prerender errors are more prominent than compile warnings.
        expect(
          cliOutput.indexOf('Turbopack build encountered')
        ).toBeGreaterThan(cliOutput.indexOf('✓ Compiled successfully'))

        const output = cliOutput
          .slice(
            cliOutput.indexOf('Turbopack build encountered'),
            cliOutput.indexOf('Finalizing page optimization')
          )
          .trim()

        expect(output).toMatchInlineSnapshot(`
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

    describe('with a prerender error', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        overrideFiles: {
          'app/boom/page.js': `export default function Page() {
            throw new Error('boom during prerender')
          }`,
        },
      })

      it('should print warnings after prerender errors', async () => {
        const { exitCode } = await next.build()
        expect(exitCode).not.toBe(0)

        const cliOutput = stripAnsi(next.cliOutput)

        const prerenderErrorIndex = cliOutput.indexOf(
          'Error occurred prerendering page "/boom"'
        )
        const exitingBuildIndex = cliOutput.indexOf(
          'Export encountered an error on /boom/page: /boom, exiting the build.'
        )
        const warningIndex = cliOutput.indexOf(
          'Turbopack build encountered 1 warning'
        )

        expect(prerenderErrorIndex).not.toBe(-1)
        expect(exitingBuildIndex).not.toBe(-1)
        expect(warningIndex).not.toBe(-1)

        // The prerender error comes first, the deferred compile warnings
        // after.
        expect(warningIndex).toBeGreaterThan(prerenderErrorIndex)
        expect(warningIndex).toBeGreaterThan(exitingBuildIndex)
      })
    })

    describe('with a prerender error and prerenderEarlyExit disabled', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        overrideFiles: {
          'app/boom/page.js': `export default function Page() {
            throw new Error('boom during prerender')
          }`,
          'next.config.js': `/** @type {import('next').NextConfig} */
          module.exports = {
            experimental: { prerenderEarlyExit: false },
          }`,
        },
      })

      it('should print warnings after prerender errors and before the failure summary', async () => {
        const { exitCode } = await next.build()
        expect(exitCode).not.toBe(0)

        const cliOutput = stripAnsi(next.cliOutput)

        const prerenderErrorIndex = cliOutput.indexOf(
          'Error occurred prerendering page "/boom"'
        )
        const warningIndex = cliOutput.indexOf(
          'Turbopack build encountered 1 warning'
        )
        const exportErrorIndex = cliOutput.indexOf('Export encountered errors')

        expect(prerenderErrorIndex).not.toBe(-1)
        expect(warningIndex).not.toBe(-1)
        expect(exportErrorIndex).not.toBe(-1)

        // Prerender errors come first, then the deferred compile warnings,
        // and the failure summary is printed last.
        expect(warningIndex).toBeGreaterThan(prerenderErrorIndex)
        expect(exportErrorIndex).toBeGreaterThan(warningIndex)
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
