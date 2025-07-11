/* eslint-env jest */

import { nextBuild } from 'next-test-utils'

const appDir = __dirname

// Turbopack doesn't support additional experimental features in the first version
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'app type checking',
  () => {
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
  }
)
