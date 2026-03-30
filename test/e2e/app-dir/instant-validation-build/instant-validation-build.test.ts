import { nextTestSetup } from 'e2e-utils'
import {
  expectNoBuildValidationErrors,
  extractBuildValidationError,
  parseValidationMessages,
} from 'e2e-utils/instant-validation'

describe('instant-validation-build', () => {
  const { next, skipped, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }
  if (!isNextStart) {
    it.skip('Build-time only test', () => {})
    return
  }
  if (!isTurbopack) {
    // TODO(instant-validation-build): snapshot tests for webpack
    it.skip('TODO: snapshot tests for webpack', () => {})
    return
  }

  const prerender = async (pathname: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      `app${pathname}/page.tsx`,
    ]
    return await next.build({
      args,
      env: {
        NEXT_TEST_LOG_VALIDATION: '1',
      },
    })
  }

  beforeAll(async () => {
    await next.build({ args: ['--experimental-build-mode', 'compile'] })
  })

  describe('basic dynamic hole detection', () => {
    // We have extensive tests for this in the instant-validation test suite.
    // This is just a basic test that we can validate a runtime prefetch, which static shell validation can't do.
    describe('valid - suspense around runtime', () => {
      it('should succeed build when cookies are inside Suspense', async () => {
        const result = await prerender(
          '/(default)/valid-suspense-around-runtime'
        )
        expectNoBuildValidationErrors(result)
      })
    })

    describe('invalid - missing suspense around runtime', () => {
      it('should fail build when cookies are outside Suspense', async () => {
        const result = await prerender(
          '/(default)/invalid-missing-suspense-around-runtime'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/invalid-missing-suspense-around-runtime": Uncached data or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route
             at main (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
         Build-time instant validation failed for route "/invalid-missing-suspense-around-runtime".
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      })
    })
  })

  describe('server errors', () => {
    it('valid - ignores server errors that do not surface in SSR', async () => {
      const result = await prerender(
        '/(default)/server-errors/error-passed-to-client-and-ignored'
      )
      expect(extractBuildValidationError(result.cliOutput)).toBe('')
      expectNoBuildValidationErrors(result)
    })

    it('error - server error that blocks page validation with no suspense boundary', async () => {
      const result = await prerender('/(default)/server-errors/page-throws')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/server-errors/page-throws": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at main (<anonymous>)
           at body (<anonymous>)
           at html (<anonymous>) {
         [cause]: Error: Kaboom
             at a (app/(default)/server-errors/page-throws/page.tsx:24:9)
           22 | async function Throws(): Promise<never> {
           23 |   await cookies()
         > 24 |   throw new Error('Kaboom')
              |         ^
           25 | }
           26 | {
           digest: '<error-digest>'
         }
       }
       Build-time instant validation failed for route "/server-errors/page-throws".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - server error that blocks page validation with a suspense boundary in a parent segment', async () => {
      const result = await prerender(
        '/(default)/server-errors/page-throws-with-suspense'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/server-errors/page-throws-with-suspense": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at main (<anonymous>)
           at a (<anonymous>)
           at body (<anonymous>)
           at html (<anonymous>) {
         [cause]: Error: Kaboom
             at b (app/(default)/server-errors/page-throws-with-suspense/page.tsx:24:9)
           22 | async function Throws(): Promise<never> {
           23 |   await cookies()
         > 24 |   throw new Error('Kaboom')
              |         ^
           25 | }
           26 | {
           digest: '<error-digest>'
         }
       }
       Build-time instant validation failed for route "/server-errors/page-throws-with-suspense".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })
  })

  describe('client errors', () => {
    it('error - server error that blocks page validation with no suspense boundary', async () => {
      const result = await prerender('/(default)/client-errors/page-throws')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/client-errors/page-throws": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at <unknown> (app/(default)/client-errors/page-throws/client.tsx:6:3)
           at main (<anonymous>)
           at body (<anonymous>)
           at html (<anonymous>)
         4 |
         5 | export function ThrowsInClient(): Promise<never> {
       > 6 |   useSearchParams()
           |   ^
         7 |   throw new Error('Kaboom')
         8 | }
         9 | {
         [cause]: Error: Kaboom
             at <unknown> (app/(default)/client-errors/page-throws/client.tsx:7:9)
           5 | export function ThrowsInClient(): Promise<never> {
           6 |   useSearchParams()
         > 7 |   throw new Error('Kaboom')
             |         ^
           8 | }
           9 |
       }
       Build-time instant validation failed for route "/client-errors/page-throws".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - client error that blocks page validation with a suspense boundary in a parent segment', async () => {
      const result = await prerender(
        '/(default)/client-errors/page-throws-with-suspense'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/client-errors/page-throws-with-suspense": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at <unknown> (app/(default)/client-errors/page-throws-with-suspense/client.tsx:6:3)
           at main (<anonymous>)
           at a (<anonymous>)
           at body (<anonymous>)
           at html (<anonymous>)
         4 |
         5 | export function ThrowsInClient(): Promise<never> {
       > 6 |   useSearchParams()
           |   ^
         7 |   throw new Error('Kaboom')
         8 | }
         9 | {
         [cause]: Error: Kaboom
             at <unknown> (app/(default)/client-errors/page-throws-with-suspense/client.tsx:7:9)
           5 | export function ThrowsInClient(): Promise<never> {
           6 |   useSearchParams()
         > 7 |   throw new Error('Kaboom')
             |         ^
           8 | }
           9 |
       }
       Build-time instant validation failed for route "/client-errors/page-throws-with-suspense".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })
  })

  describe('searchParams', () => {
    it('search params are correctly read from samples', async () => {
      const result = await prerender(
        '/(default)/search-params/valid-search-params-in-samples'
      )
      expect(result.cliOutput).not.toContain('AssertionError')
      expectNoBuildValidationErrors(result)
    })

    it('error - accessing search param not present in samples', async () => {
      const result = await prerender(
        '/(default)/search-params/invalid-undeclared-search-param'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-search-param" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, or \`{ "undeclared": null }\` if it should be absent.
           at <unknown> (app/(default)/search-params/invalid-undeclared-search-param/page.tsx:31:14)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/search-params/invalid-undeclared-search-param/page.tsx:30:3)
         29 |   const sp = await searchParams
         30 |   ensureThrows(
       > 31 |     () => sp.undeclared,
            |              ^
         32 |     \`Expected accessing an undeclared search param to throw\`
         33 |   )
         34 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-search-param".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('useSearchParams() receives search params from samples', async () => {
      const result = await prerender(
        '/(default)/search-params/valid-use-search-params'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - accessing search param not present in samples and catching the error', async () => {
      const result = await prerender(
        '/(default)/search-params/invalid-undeclared-search-param-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-search-param-caught" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, or \`{ "undeclared": null }\` if it should be absent.
           at <unknown> (app/(default)/search-params/invalid-undeclared-search-param-caught/page.tsx:35:16)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/search-params/invalid-undeclared-search-param-caught/page.tsx:34:5)
         33 |   try {
         34 |     ensureThrows(
       > 35 |       () => sp.undeclared,
            |                ^
         36 |       \`Expected accessing an undeclared search param to throw\`
         37 |     )
         38 |   } catch (err) { {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-search-param-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - accessing undeclared search param via useSearchParams()', async () => {
      const result = await prerender(
        '/(default)/search-params/invalid-undeclared-use-search-params'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-use-search-params" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, or \`{ "undeclared": null }\` if it should be absent.
           at <unknown> (app/(default)/search-params/invalid-undeclared-use-search-params/search-params-reader.tsx:9:14)
           at <unknown> (ensure-error.ts:11:5)
           at <unknown> (app/(default)/search-params/invalid-undeclared-use-search-params/search-params-reader.tsx:8:3)
          7 |   const sp = useSearchParams()
          8 |   ensureThrows(
       >  9 |     () => sp.get('undeclared'),
            |              ^
         10 |     \`Expected accessing an undeclared search param to throw\`
         11 |   )
         12 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-use-search-params".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - accessing undeclared search param via useSearchParams() and catching the error', async () => {
      const result = await prerender(
        '/(default)/search-params/invalid-undeclared-use-search-params-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-use-search-params-caught" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, or \`{ "undeclared": null }\` if it should be absent.
           at <unknown> (app/(default)/search-params/invalid-undeclared-use-search-params-caught/search-params-reader.tsx:10:16)
           at <unknown> (ensure-error.ts:11:5)
           at <unknown> (app/(default)/search-params/invalid-undeclared-use-search-params-caught/search-params-reader.tsx:9:5)
          8 |   try {
          9 |     ensureThrows(
       > 10 |       () => sp.get('undeclared'),
            |                ^
         11 |       \`Expected accessing an undeclared search param to throw\`
         12 |     )
         13 |   } catch { {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-use-search-params-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('valid - awaited search params passed to a cache', async () => {
      const result = await prerender(
        '/(default)/search-params/valid-search-params-passed-to-cache'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - awaited search params passed to a client component', async () => {
      const result = await prerender(
        '/(default)/search-params/valid-search-params-passed-to-client'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('headers', () => {
    it('headers are correctly read from samples', async () => {
      const result = await prerender(
        '/(default)/headers/valid-headers-in-samples'
      )
      expect(result.cliOutput).not.toContain('AssertionError')
      expectNoBuildValidationErrors(result)
    })

    it('error - .get() of header not present in samples', async () => {
      const result = await prerender(
        '/(default)/headers/invalid-undeclared-header-get'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/headers/invalid-undeclared-header-get" accessed header "undeclaredheader" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`headers\` array, or \`["undeclaredheader", null]\` if it should be absent.
           at <unknown> (app/(default)/headers/invalid-undeclared-header-get/page.tsx:27:24)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/headers/invalid-undeclared-header-get/page.tsx:26:3)
         25 |   const headersStore = await headers()
         26 |   ensureThrows(
       > 27 |     () => headersStore.get('undeclaredHeader'),
            |                        ^
         28 |     \`Expected get() to throw for undeclared headers\`
         29 |   )
         30 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/headers/invalid-undeclared-header-get".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - .get() of header not present in samples and catching the error', async () => {
      const result = await prerender(
        '/(default)/headers/invalid-undeclared-header-get-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/headers/invalid-undeclared-header-get-caught" accessed header "undeclaredheader" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`headers\` array, or \`["undeclaredheader", null]\` if it should be absent.
           at <unknown> (app/(default)/headers/invalid-undeclared-header-get-caught/page.tsx:30:25)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/headers/invalid-undeclared-header-get-caught/page.tsx:29:5)
         28 |   try {
         29 |     ensureThrows(
       > 30 |       () => headerStore.get('undeclaredHeader'),
            |                         ^
         31 |       \`Expected get() to throw for undeclared headers\`
         32 |     )
         33 |   } catch (err) { {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/headers/invalid-undeclared-header-get-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - .has() of header not present in samples', async () => {
      const result = await prerender(
        '/(default)/headers/invalid-undeclared-header-has'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/headers/invalid-undeclared-header-has" accessed header "undeclaredheader" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`headers\` array, or \`["undeclaredheader", null]\` if it should be absent.
           at <unknown> (app/(default)/headers/invalid-undeclared-header-has/page.tsx:27:23)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/headers/invalid-undeclared-header-has/page.tsx:26:3)
         25 |   const headerStore = await headers()
         26 |   ensureThrows(
       > 27 |     () => headerStore.has('undeclaredHeader'),
            |                       ^
         28 |     \`Expected has() to throw for undeclared headers\`
         29 |   )
         30 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/headers/invalid-undeclared-header-has".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('valid - header value passed to a cache', async () => {
      const result = await prerender(
        '/(default)/headers/valid-headers-passed-to-cache'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - header value passed to a client component', async () => {
      const result = await prerender(
        '/(default)/headers/valid-headers-passed-to-client'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('cookies', () => {
    it('cookies are correctly read from samples', async () => {
      const result = await prerender(
        '/(default)/cookies/valid-cookies-in-samples'
      )
      expect(result.cliOutput).not.toContain('AssertionError')
      expectNoBuildValidationErrors(result)
    })

    it('error - .get() of cookie not present in samples', async () => {
      const result = await prerender(
        '/(default)/cookies/invalid-undeclared-cookie-get'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/cookies/invalid-undeclared-cookie-get" accessed cookie "undeclaredCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "undeclaredCookie", value: null }\` if it should be absent.
           at <unknown> (app/(default)/cookies/invalid-undeclared-cookie-get/page.tsx:28:23)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/cookies/invalid-undeclared-cookie-get/page.tsx:27:3)
         26 |
         27 |   ensureThrows(
       > 28 |     () => cookieStore.get('undeclaredCookie'),
            |                       ^
         29 |     \`Expected get() to throw for undeclared cookies\`
         30 |   )
         31 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/cookies/invalid-undeclared-cookie-get".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - .get() of cookie not present in samples and catching the error', async () => {
      const result = await prerender(
        '/(default)/cookies/invalid-undeclared-cookie-get-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/cookies/invalid-undeclared-cookie-get-caught" accessed cookie "undeclaredCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "undeclaredCookie", value: null }\` if it should be absent.
           at <unknown> (app/(default)/cookies/invalid-undeclared-cookie-get-caught/page.tsx:30:25)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/cookies/invalid-undeclared-cookie-get-caught/page.tsx:29:5)
         28 |   try {
         29 |     ensureThrows(
       > 30 |       () => cookieStore.get('undeclaredCookie'),
            |                         ^
         31 |       \`Expected get() to throw for undeclared cookies\`
         32 |     )
         33 |   } catch (err) { {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/cookies/invalid-undeclared-cookie-get-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - .has() of cookie not present in samples', async () => {
      const result = await prerender(
        '/(default)/cookies/invalid-undeclared-cookie-has'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/cookies/invalid-undeclared-cookie-has" accessed cookie "undeclaredCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "undeclaredCookie", value: null }\` if it should be absent.
           at <unknown> (app/(default)/cookies/invalid-undeclared-cookie-has/page.tsx:27:23)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/cookies/invalid-undeclared-cookie-has/page.tsx:26:3)
         25 |   const cookieStore = await cookies()
         26 |   ensureThrows(
       > 27 |     () => cookieStore.has('undeclaredCookie'),
            |                       ^
         28 |     \`Expected has() to throw for undeclared cookies\`
         29 |   )
         30 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/cookies/invalid-undeclared-cookie-has".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('valid - cookies passed to a cache', async () => {
      const result = await prerender(
        '/(default)/cookies/valid-cookies-passed-to-cache'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('params', () => {
    it('valid - params are correctly read from samples', async () => {
      const result = await prerender(
        '/(default)/params/valid-params-in-samples/[one]/[two]'
      )
      expect(result.cliOutput).not.toContain('AssertionError')
      expectNoBuildValidationErrors(result)
    })

    it('error - reading a param not present in samples', async () => {
      const result = await prerender(
        '/(default)/params/invalid-param-not-provided/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-param-not-provided/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` object.
           at <unknown> (app/(default)/params/invalid-param-not-provided/[one]/[two]/page.tsx:47:24)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/params/invalid-param-not-provided/[one]/[two]/page.tsx:47:3)
         45 |
         46 |   // We're not allowed to access params not in the samples.
       > 47 |   ensureThrows(() => p.two)
            |                        ^
         48 |
         49 |   // TODO: test \`in\` and iteration
         50 |   // assert.deepStrictEqual( {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-param-not-provided/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - reading a param not present in samples and catching the error', async () => {
      const result = await prerender(
        '/(default)/params/invalid-param-not-provided-caught/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-param-not-provided-caught/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` object.
           at <unknown> (app/(default)/params/invalid-param-not-provided-caught/[one]/[two]/page.tsx:45:26)
           at <unknown> (ensure-error.ts:11:5)
           at a (app/(default)/params/invalid-param-not-provided-caught/[one]/[two]/page.tsx:45:5)
         43 |   try {
         44 |     // We're not allowed to access params not in the samples.
       > 45 |     ensureThrows(() => p.two, \`Expected accessing an undeclared param to throw\`)
            |                          ^
         46 |   } catch (err) {
         47 |     // We swallow the error. It should still be reported and fail the validation.
         48 |   } {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-param-not-provided-caught/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('useParams() receives params from samples', async () => {
      const result = await prerender(
        '/(default)/params/valid-use-params/[one]/[two]'
      )
      expect(result.cliOutput).not.toContain('AssertionError')
      expectNoBuildValidationErrors(result)
    })

    it('error - accessing a param not present in samples via useParams()', async () => {
      const result = await prerender(
        '/(default)/params/invalid-undeclared-use-params/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-undeclared-use-params/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` object.
           at <unknown> (app/(default)/params/invalid-undeclared-use-params/[one]/[two]/params-reader.tsx:10:18)
           at <unknown> (ensure-error.ts:11:5)
           at <unknown> (app/(default)/params/invalid-undeclared-use-params/[one]/[two]/params-reader.tsx:9:3)
          8 |   // We're not allowed to access params not in the samples.
          9 |   ensureThrows(
       > 10 |     () => params.two,
            |                  ^
         11 |     \`Expected accessing an undeclared param to throw\`
         12 |   )
         13 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-undeclared-use-params/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - accessing a param not present in samples via useParams() and catching the error', async () => {
      const result = await prerender(
        '/(default)/params/invalid-undeclared-use-params-caught/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-undeclared-use-params-caught/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` object.
           at <unknown> (app/(default)/params/invalid-undeclared-use-params-caught/[one]/[two]/params-reader.tsx:11:20)
           at <unknown> (ensure-error.ts:11:5)
           at <unknown> (app/(default)/params/invalid-undeclared-use-params-caught/[one]/[two]/params-reader.tsx:10:5)
          9 |     // We're not allowed to access params not in the samples.
         10 |     ensureThrows(
       > 11 |       () => params.two,
            |                    ^
         12 |       \`Expected accessing an undeclared param to throw\`
         13 |     )
         14 |   } catch { {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-undeclared-use-params-caught/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('valid - awaited params passed to a cache', async () => {
      const result = await prerender(
        '/(default)/params/valid-params-passed-to-cache/[slug]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - awaited params passed to a client component', async () => {
      const result = await prerender(
        '/(default)/params/valid-params-passed-to-client/[slug]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('pathname', () => {
    it('valid - usePathname() on a route without params', async () => {
      const result = await prerender(
        '/(default)/pathname/valid-use-pathname-no-params'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - usePathname() on a route with params (all provided in samples)', async () => {
      const result = await prerender(
        '/(default)/pathname/valid-use-pathname-with-params/[one]/[two]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - usePathname() on a route inside a route group does not include the group segment', async () => {
      const result = await prerender(
        '/(default)/pathname/valid-use-pathname-route-group/(route-group)'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - usePathname() on a catch-all route', async () => {
      const result = await prerender(
        '/(default)/pathname/valid-use-pathname-catch-all/[...catchAll]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('valid - usePathname() on an optional catch-all route', async () => {
      const result = await prerender(
        '/(default)/pathname/valid-use-pathname-optional-catch-all/[[...optionalCatchAll]]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - usePathname() on a route with params but not all provided in samples', async () => {
      const result = await prerender(
        '/(default)/pathname/invalid-use-pathname-missing-params/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/pathname/invalid-use-pathname-missing-params/[one]/[two]" called usePathname() but param "two" is not defined in the \`samples\` of \`unstable_instant\`. usePathname() requires all route params to be provided.
           at <unknown> (app/(default)/pathname/invalid-use-pathname-missing-params/[one]/[two]/pathname-reader.tsx:9:11)
           at <unknown> (ensure-error.ts:11:5)
           at <unknown> (app/(default)/pathname/invalid-use-pathname-missing-params/[one]/[two]/pathname-reader.tsx:7:3)
          7 |   ensureThrows(
          8 |     // eslint-disable-next-line react-hooks/rules-of-hooks
       >  9 |     () => usePathname(),
            |           ^
         10 |     \`Expected usePathname() to throw when not all params are provided in samples\`
         11 |   )
         12 |   return null {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/pathname/invalid-use-pathname-missing-params/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })
  })

  describe('root params', () => {
    it.each(['static', 'runtime'])(
      'valid - %s - root params are correctly read from samples',
      async (variant) => {
        const result = await prerender(
          `/root-params/[lang]/valid-root-param-in-samples/${variant}`
        )
        expectNoBuildValidationErrors(result)
        // The page asserts on the values
        expect(result.cliOutput).not.toContain('AssertionError')
      }
    )

    it('error - reading a root param not present in samples', async () => {
      const result = await prerender(
        '/root-params/[lang]/invalid-root-param-not-provided'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/root-params/[lang]/invalid-root-param-not-provided" accessed root param "lang" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` object.
           at <unknown> (app/root-params/[lang]/invalid-root-param-not-provided/page.tsx:17:11)
           at a (ensure-error.ts:48:11)
           at b (app/root-params/[lang]/invalid-root-param-not-provided/page.tsx:16:9)
         15 |
         16 |   await ensureRejects(
       > 17 |     () => lang(),
            |           ^
         18 |     \`Expected lang() to error if sample is not provided\`
         19 |   )
         20 |   return ( {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/root-params/[lang]/invalid-root-param-not-provided".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })

    it('error - reading a root param not present in samples and catching the error', async () => {
      const result = await prerender(
        '/root-params/[lang]/invalid-root-param-not-provided-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/root-params/[lang]/invalid-root-param-not-provided-caught" accessed root param "lang" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` object.
           at <unknown> (app/root-params/[lang]/invalid-root-param-not-provided-caught/page.tsx:18:13)
           at a (ensure-error.ts:48:11)
           at b (app/root-params/[lang]/invalid-root-param-not-provided-caught/page.tsx:17:11)
         16 |   try {
         17 |     await ensureRejects(
       > 18 |       () => lang(),
            |             ^
         19 |       \`Expected lang() to error if sample is not provided\`
         20 |     )
         21 |   } catch { {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/root-params/[lang]/invalid-root-param-not-provided-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.cliOutput).not.toContain('AssertionError')
      expect(result.exitCode).toBe(1)
    })
  })

  describe('samples precedence', () => {
    it('page samples override layout samples', async () => {
      const result = await prerender(
        '/(default)/samples-precedence/[slug]/page-overrides'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('page inherits samples from layout when it has none', async () => {
      const result = await prerender(
        '/(default)/samples-precedence/[slug]/page-inherits'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('generateStaticParams', () => {
    it('valid - page with generateStaticParams and samples only runs validation once', async () => {
      const result = await prerender('/(default)/gsp/[slug]')

      // If validation ran once, we expect one "validation_start"/"validation_end" pair
      const validationMessages = parseValidationMessages(result.cliOutput)
      expect(validationMessages).toEqual([
        expect.objectContaining({ type: 'validation_start' }),
        expect.objectContaining({ type: 'validation_end' }),
      ])

      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('caches', () => {
    it('valid - static prefetch - awaiting a cache in the static stage does not require a suspense boundary', async () => {
      const result = await prerender(
        '/(default)/valid-await-cache-without-suspense/static'
      )
      expectNoBuildValidationErrors(result)
    })

    it('valid - runtime prefetch - awaiting a cache in the runtime stage does not require a suspense boundary', async () => {
      const result = await prerender(
        '/(default)/valid-await-cache-without-suspense/runtime'
      )
      expectNoBuildValidationErrors(result)
    })

    it('valid - runtime prefetch - awaiting a mix of caches in the static and runtime stages does not require a suspense boundary', async () => {
      const result = await prerender(
        '/(default)/valid-await-cache-without-suspense/mixed'
      )
      expectNoBuildValidationErrors(result)
    })

    it('valid - runtime prefetch - awaiting a private cache in the runtime stage does not require a suspense boundary', async () => {
      const result = await prerender(
        '/(default)/valid-await-cache-without-suspense/private'
      )
      expectNoBuildValidationErrors(result)
    })
  })
})
