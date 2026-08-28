import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Each case names a route of the fixture and a distinctive part of the error
// that its static variant combinations must produce. The dev server compiles a
// route on request, so one server reports every one of them.
const cases: ReadonlyArray<readonly [string, string]> = [
  [
    'not-an-array',
    '`unstable_generateStaticVariants` for /case/not-an-array/[slug] did not return an array. Return a list of combinations',
  ],
  [
    'combination-not-an-array',
    '`unstable_generateStaticVariants` for /case/combination-not-an-array/[slug] returned a combination that is not an array.',
  ],
  [
    'not-a-tuple',
    '`unstable_generateStaticVariants` for /case/not-a-tuple/[slug] returned a combination containing something that is not a `[variant, value]` tuple.',
  ],
  [
    'not-a-variant',
    '`unstable_generateStaticVariants` for /case/not-a-variant/[slug] assigned a value to something that is not a variant.',
  ],
  [
    'assigned-twice',
    '`unstable_generateStaticVariants` for /case/assigned-twice/[slug] assigned the variant `theme@variants.ts` more than once in one combination.',
  ],
  [
    'non-string-value',
    'The variant `theme@variants.ts` was assigned a number value. Variant values must be strings.',
  ],
  [
    'empty-combination',
    '`unstable_generateStaticVariants` for /case/empty-combination/[slug] returned an empty combination.',
  ],
  [
    'ambiguous-disjoint',
    'neither of which is more specific than the other: {"theme@variants.ts":"dark"} and {"locale@variants.ts":"en"}',
  ],
  [
    'ambiguous-crossing',
    'neither of which is more specific than the other: {"theme@variants.ts":"dark","locale@variants.ts":"en"} and {"theme@variants.ts":"dark","country@variants.ts":"us"}',
  ],
  [
    'on-layout',
    'on-layout/layout.tsx exported `unstable_generateStaticVariants`, but only a page may declare variant combinations.',
  ],
  [
    'on-route',
    '/case/on-route/[slug] exported `unstable_generateStaticVariants`, but variants in a route handler are not supported yet.',
  ],
]

// Variants are supported with Turbopack only, so a webpack build rejects the
// config of this fixture before it reads any route.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'static variant combinations that are rejected',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/invalid-combinations',
      // Every route of this fixture declares combinations that are rejected, so
      // a build of all of them at once cannot succeed. Both modes below drive
      // Next.js by hand instead.
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      beforeAll(async () => {
        await next.start()
      })

      it.each(cases)('should report %s', async (name, expected) => {
        const response = await next.fetch(`/case/${name}/requested`)

        expect(response.status).toBe(500)

        await retry(async () => {
          expect(next.cliOutput).toContain(expected)
        })
      })
    } else {
      it('should reject a combination on a route with no dynamic segments', async () => {
        // The dev server reads the static variant combinations of a route when
        // it builds the static paths of that route, and it builds them for a
        // dynamic route on request. This route has no dynamic segments, so it
        // builds no static paths at all, and only a build reads what it
        // declared.
        //
        // `--debug-build-paths` restricts the build to this one route, so no
        // other route of the fixture can fail first.
        const { exitCode, cliOutput } = await next.build({
          args: [
            '--debug-build-paths',
            'app/case/no-dynamic-segments/page.tsx',
          ],
        })

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          '`unstable_generateStaticVariants` for /case/no-dynamic-segments did not return an array.'
        )
      })
    }
  }
)
