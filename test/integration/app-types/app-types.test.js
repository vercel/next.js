/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'

const appDir = __dirname

// Turbopack doesn't support additional experimental features in the first version
;(process.env.TURBOPACK ? describe.skip : describe)('app type checking', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let stderr, errors
      beforeAll(async () => {
        stderr = (await nextBuild(appDir, [], { stderr: true })).stderr

        errors = stderr.match(
          /===== TS errors =====(.+)===== TS errors =====/s
        )?.[1]
      })

      it('should generate route types correctly and report link error', async () => {
        // Make sure the d.ts file is generated
        const dts = (
          await fs.readFile(path.join(appDir, '.next', 'types', 'link.d.ts'))
        ).toString()
        expect(dts.includes('`/dashboard/user/')).toBeTruthy()
        expect(dts.includes('`/dashboard/another')).toBeTruthy()

        // Check type checking errors
        expect(errors).toContain(
          'Type error: "/(newroot)/dashboard/another" is not an existing route. If it is intentional, please type it explicitly with `as Route`.'
        )

        // Make sure all errors were reported and other links passed type checking
        const errorLines = [
          ...errors.matchAll(
            /\.\/src\/app\/type-checks\/link\/page\.tsx:(\d+):/g
          ),
        ].map(([, line]) => +line)

        const ST = 18
        const ED = 35
        expect(errorLines).toEqual(
          Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
        )
      })

      it('should generate route types correctly and report router API errors', async () => {
        // Make sure all errors were reported and other links passed type checking
        const errorLines = [
          ...errors.matchAll(
            /\.\/src\/app\/type-checks\/router\/page\.tsx:(\d+):/g
          ),
        ].map(([, line]) => +line)

        const ST = 11
        const ED = 13
        expect(errorLines).toEqual(
          Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
        )
      })

      it('should generate route types correctly and report form errors', async () => {
        // Make sure all errors were reported and other Forms passed type checking
        const errorLines = [
          ...errors.matchAll(
            /\.\/src\/app\/type-checks\/form\/page\.tsx:(\d+):/g
          ),
        ].map(([, line]) => +line)

        const ST = 8
        const ED = 10
        expect(errorLines).toEqual(
          Array.from({ length: ED - ST + 1 }, (_, i) => i + ST)
        )
      })

      it('should type check invalid entry exports', () => {
        // Can't export arbitrary things.
        expect(errors).toContain(`"foo" is not a valid Page export field.`)

        // Can't export invalid fields.
        expect(errors).toMatch(
          /Invalid configuration "revalidate":\s+Expected "false | number (>= 0)", got "-1"/
        )

        // Avoid invalid argument types for exported functions.
        expect(errors).toMatch(
          /Page "src\/app\/type-checks\/config\/page\.tsx" has an invalid "default" export:\s+Type "{ foo: string; }" is not valid/
        )
        expect(errors).toMatch(
          /Page "src\/app\/type-checks\/config\/page\.tsx" has an invalid "generateMetadata" export:\s+Type "{ s: number; }" is not valid/
        )
        expect(errors).toMatch(
          /Page "src\/app\/type-checks\/config\/page\.tsx" has an invalid "generateStaticParams" export:\s+Type "string" is not valid/
        )

        // Avoid invalid return types for exported functions.
        expect(errors).toContain(
          `"Promise<number>" is not a valid generateStaticParams return type`
        )

        // Can't export arbitrary things.
        expect(errors).toContain(`"bar" is not a valid Route export field.`)

        // Can't export invalid fields.
        expect(errors).toMatch(
          /Invalid configuration "revalidate":\s+Expected "false | number (>= 0)", got "-1"/
        )

        // Avoid invalid argument types for exported functions.
        expect(errors).toMatch(
          /Route "src\/app\/type-checks\/route-handlers\/route\.ts" has an invalid "GET" export:\s+Type "boolean" is not a valid type for the function's first argument/
        )
        expect(errors).toMatch(
          /Route "src\/app\/type-checks\/route-handlers\/route\.ts" has an invalid "generateStaticParams" export:\s+Type "string" is not valid/
        )

        // Avoid invalid return types for exported functions.
        expect(errors).toContain(
          `"Promise<boolean>" is not a valid generateStaticParams return type`
        )
      })
    }
  )
})
