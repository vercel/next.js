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

        // Pure path.join (join-cwd.js) must NOT warn. Only real fs access
        // (read-dynamic.js) warns, with fs function as origin.
        expect(next.cliOutput).toContain(
          'Turbopack build encountered 1 warning:'
        )
        expect(output).toContain('./app/read-dynamic.js')
        expect(output).toContain('fs.readFileSync')
        expect(output).not.toContain('./app/join-cwd.js')
      })

      it('should not warn for fs calls annotated with turbopackIgnore', async () => {
        // The build above (in the previous test) already ran; assert that none of
        // the `turbopackIgnore`-annotated accesses in ./app/read-ignored.js produced
        // a warning. This covers both the comment on the fs call's own argument
        // (`readBareArg`) and the comment on a nested `path.join(...)` argument
        // (`readJoinedArg`, issue #95125). Only ./app/read-dynamic.js should warn.
        expect(next.cliOutput).toContain(
          'Turbopack build encountered 1 warning:'
        )
        expect(next.cliOutput).not.toContain('./app/read-ignored.js')
        expect(next.cliOutput).not.toContain('./app/join-cwd.js')
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
