import { nextTestSetup } from 'e2e-utils'
import {
  expectNoBuildValidationErrors,
  extractBuildValidationError,
} from 'e2e-utils/instant-validation'

describe('instant-validation-build', () => {
  const { next, skipped, isNextStart } = nextTestSetup({
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
        const result = await prerender('/valid-suspense-around-runtime')
        expectNoBuildValidationErrors(result)
      })
    })

    describe('invalid - missing suspense around runtime', () => {
      it('should fail build when cookies are outside Suspense', async () => {
        const result = await prerender(
          '/invalid-missing-suspense-around-runtime'
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
        '/server-errors/error-passed-to-client-and-ignored'
      )
      expect(extractBuildValidationError(result.cliOutput)).toBe('')
      expectNoBuildValidationErrors(result)
    })

    it('error - server error that blocks page validation with no suspense boundary', async () => {
      const result = await prerender('/server-errors/page-throws')
      // TODO(instant-validation-build): Server component errors that surface in the client render have bad error messages.
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/server-errors/page-throws": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at main (<anonymous>)
           at body (<anonymous>)
           at html (<anonymous>) {
         [cause]: [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] {
           digest: ''
         }
       }
       Error: Route "/server-errors/page-throws": Could not validate \`unstable_instant\` because an error prevented the page from rendering.
           at ignore-listed frames {
         [cause]: [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] {
           digest: ''
         }
       }
       Build-time instant validation failed for route "/server-errors/page-throws".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - server error that blocks page validation with a suspense boundary in a parent segment', async () => {
      const result = await prerender('/server-errors/page-throws-with-suspense')
      // TODO(instant-validation-build): Server component errors that surface in the client render have bad error messages.
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/server-errors/page-throws-with-suspense": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at main (<anonymous>)
           at Suspense (<anonymous>)
           at body (<anonymous>)
           at html (<anonymous>) {
         [cause]: [Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.] {
           digest: ''
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
      const result = await prerender('/client-errors/page-throws')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/client-errors/page-throws": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at <unknown> (app/client-errors/page-throws/client.tsx:6:3)
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
             at <unknown> (app/client-errors/page-throws/client.tsx:7:9)
           5 | export function ThrowsInClient(): Promise<never> {
           6 |   useSearchParams()
         > 7 |   throw new Error('Kaboom')
             |         ^
           8 | }
           9 |
       }
       Error: Route "/client-errors/page-throws": Could not validate \`unstable_instant\` because an error prevented the page from rendering.
           at ignore-listed frames {
         [cause]: Error: Kaboom
             at <unknown> (app/client-errors/page-throws/client.tsx:7:9)
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
      const result = await prerender('/client-errors/page-throws-with-suspense')
      // TODO(instant-validation-build): The page segment errored, but a suspense from a parent segment hid the error.
      // This should be a "Unable to validate" error, because we don't even know what we didn't render.
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/client-errors/page-throws-with-suspense": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.
           at <unknown> (app/client-errors/page-throws-with-suspense/client.tsx:6:3)
           at main (<anonymous>)
           at Suspense (<anonymous>)
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
             at <unknown> (app/client-errors/page-throws-with-suspense/client.tsx:7:9)
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
        '/search-params/valid-search-params-in-samples'
      )
      expectNoBuildValidationErrors(result)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - accessing search param not present in samples', async () => {
      const result = await prerender(
        '/search-params/invalid-undeclared-search-param'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-search-param" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, or \`{ "undeclared": null }\` if it should be absent.
           at e (app/search-params/invalid-undeclared-search-param/page.tsx:31:14)
         29 |   searchParams: Promise<{ q?: string; undeclared?: string }>
         30 | }) {
       > 31 |   const { q, undeclared } = await searchParams
            |              ^
         32 |   return (
         33 |     <div id="search-result">
         34 |       query: {q}, undeclared: {undeclared} {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-search-param".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('useSearchParams() receives search params from samples', async () => {
      const result = await prerender('/search-params/valid-use-search-params')
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('ClientAssertionError')
    })

    it('error - accessing search param not present in samples and catching the error', async () => {
      const result = await prerender(
        '/search-params/invalid-undeclared-search-param-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-search-param-caught" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` object, or \`{ "undeclared": null }\` if it should be absent.
           at e (app/search-params/invalid-undeclared-search-param-caught/page.tsx:36:27)
         34 |
         35 |   try {
       > 36 |     const undeclared = sp.undeclared // this should throw
            |                           ^
         37 |     // prevent DCE of unused expression
         38 |     if (Math.random() > 1) {
         39 |       console.log(undeclared) {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-search-param-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - accessing undeclared search param via useSearchParams()', async () => {
      const result = await prerender(
        '/search-params/invalid-undeclared-use-search-params'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-use-search-params" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` array, or \`{ "undeclared": null }\` if it should be absent if it should be absent.
           at <unknown> (app/search-params/invalid-undeclared-use-search-params/search-params-reader.tsx:8:20)
          6 |   const sp = useSearchParams()
          7 |   // 'undeclared' is not in the sample's searchParams, so this should error
       >  8 |   const value = sp.get('undeclared')
            |                    ^
          9 |   return <div id="result">undeclared: {value}</div>
         10 | }
         11 | {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-use-search-params".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - accessing undeclared search param via useSearchParams() and catching the error', async () => {
      const result = await prerender(
        '/search-params/invalid-undeclared-use-search-params-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/search-params/invalid-undeclared-use-search-params-caught" accessed searchParam "undeclared" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`searchParams\` array, or \`{ "undeclared": null }\` if it should be absent if it should be absent.
           at <unknown> (app/search-params/invalid-undeclared-use-search-params-caught/search-params-reader.tsx:9:22)
          7 |   // 'undeclared' is not in the sample's searchParams, so this should error
          8 |   try {
       >  9 |     const value = sp.get('undeclared')
            |                      ^
         10 |     // prevent DCE of unused expression
         11 |     if (Math.random() > 1) {
         12 |       console.log(value) {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/search-params/invalid-undeclared-use-search-params-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })
  })

  describe('headers', () => {
    it('headers are correctly read from samples', async () => {
      const result = await prerender('/headers/valid-headers-in-samples')
      expectNoBuildValidationErrors(result)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - .get() of header not present in samples', async () => {
      const result = await prerender('/headers/invalid-undeclared-header-get')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/headers/invalid-undeclared-header-get" accessed header "undeclaredheader" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`headers\` array, or \`["undeclaredheader", null]\` if it should be absent.
           at g (app/headers/invalid-undeclared-header-get/page.tsx:27:41)
         25 |   const headersStore = await headers()
         26 |   // TODO(instant-validation-build): should this throw in addition to aborting?
       > 27 |   const undeclaredHeader = headersStore.get('undeclaredHeader')
            |                                         ^
         28 |   assert.strictEqual(
         29 |     undeclaredHeader,
         30 |     undefined, {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/headers/invalid-undeclared-header-get".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - .get() of header not present in samples and catching the error', async () => {
      const result = await prerender(
        '/headers/invalid-undeclared-header-get-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/headers/invalid-undeclared-header-get-caught" accessed header "undeclaredheader" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`headers\` array, or \`["undeclaredheader", null]\` if it should be absent.
           at f (app/headers/invalid-undeclared-header-get-caught/page.tsx:28:42)
         26 |
         27 |   try {
       > 28 |     const undeclaredHeader = headerStore.get('undeclaredHeader') // this should throw
            |                                          ^
         29 |     // prevent DCE of unused expression
         30 |     if (Math.random() > 1) {
         31 |       console.log(undeclaredHeader) {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/headers/invalid-undeclared-header-get-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - .has() of header not present in samples', async () => {
      const result = await prerender('/headers/invalid-undeclared-header-has')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/headers/invalid-undeclared-header-has" accessed header "undeclaredheader" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`headers\` array, or \`["undeclaredheader", null]\` if it should be absent.
           at g (app/headers/invalid-undeclared-header-has/page.tsx:27:43)
         25 |   const headerStore = await headers()
         26 |   // TODO(instant-validation-build): should this throw in addition to aborting?
       > 27 |   const hasUndeclaredHeader = headerStore.has('undeclaredHeader')
            |                                           ^
         28 |   assert.strictEqual(
         29 |     hasUndeclaredHeader,
         30 |     false, {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/headers/invalid-undeclared-header-has".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('cookies', () => {
    it('cookies are correctly read from samples', async () => {
      const result = await prerender('/cookies/valid-cookies-in-samples')
      expectNoBuildValidationErrors(result)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - .get() of cookie not present in samples', async () => {
      const result = await prerender('/cookies/invalid-undeclared-cookie-get')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/cookies/invalid-undeclared-cookie-get" accessed cookie "undeclaredCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "undeclaredCookie", value: null }\` if it should be absent.
           at g (app/cookies/invalid-undeclared-cookie-get/page.tsx:27:40)
         25 |   const cookieStore = await cookies()
         26 |   // TODO(instant-validation-build): should this throw in addition to aborting?
       > 27 |   const undeclaredCookie = cookieStore.get('undeclaredCookie')
            |                                        ^
         28 |   assert.strictEqual(
         29 |     undeclaredCookie,
         30 |     undefined, {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/cookies/invalid-undeclared-cookie-get".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - .get() of cookie not present in samples and catching the error', async () => {
      const result = await prerender(
        '/cookies/invalid-undeclared-cookie-get-caught'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/cookies/invalid-undeclared-cookie-get-caught" accessed cookie "undeclaredCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "undeclaredCookie", value: null }\` if it should be absent.
           at f (app/cookies/invalid-undeclared-cookie-get-caught/page.tsx:28:42)
         26 |
         27 |   try {
       > 28 |     const undeclaredCookie = cookieStore.get('undeclaredCookie') // this should throw
            |                                          ^
         29 |     // prevent DCE of unused expression
         30 |     if (Math.random() > 1) {
         31 |       console.log(undeclaredCookie) {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/cookies/invalid-undeclared-cookie-get-caught".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - .has() of cookie not present in samples', async () => {
      const result = await prerender('/cookies/invalid-undeclared-cookie-has')
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/cookies/invalid-undeclared-cookie-has" accessed cookie "undeclaredCookie" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`cookies\` array, or \`{ name: "undeclaredCookie", value: null }\` if it should be absent.
           at g (app/cookies/invalid-undeclared-cookie-has/page.tsx:27:43)
         25 |   const cookieStore = await cookies()
         26 |   // TODO(instant-validation-build): should this throw in addition to aborting?
       > 27 |   const hasUndeclaredCookie = cookieStore.has('undeclaredCookie')
            |                                           ^
         28 |   assert.strictEqual(
         29 |     hasUndeclaredCookie,
         30 |     false, {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/cookies/invalid-undeclared-cookie-has".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('params', () => {
    it('valid - params are correctly read from samples', async () => {
      const result = await prerender(
        '/params/valid-params-in-samples/[one]/[two]'
      )
      expectNoBuildValidationErrors(result)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - reading a param not present in samples', async () => {
      const result = await prerender(
        '/params/invalid-param-not-provided/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-param-not-provided/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` array.
           at f (app/params/invalid-param-not-provided/[one]/[two]/page.tsx:45:18)
         43 |   assert.equal(p.one, '123', \`Unexpected value for param 'one'\`)
         44 |   // TODO(instant-validation-build): this should throw and abort
       > 45 |   assert.equal(p.two, undefined, \`Unexpected value for param 'two'\`)
            |                  ^
         46 |
         47 |   // TODO: test \`in\` and iteration
         48 |   // assert.deepStrictEqual( {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-param-not-provided/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('error - reading a param not present in samples and catching the error', async () => {
      const result = await prerender(
        '/params/invalid-param-not-provided-caught/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-param-not-provided-caught/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` array.
           at f (app/params/invalid-param-not-provided-caught/[one]/[two]/page.tsx:47:24)
         45 |
         46 |   try {
       > 47 |     const twoValue = p.two // this should throw
            |                        ^
         48 |     // prevent DCE of unused expression
         49 |     if (Math.random() > 1) {
         50 |       console.log(twoValue) {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-param-not-provided-caught/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
      // The page asserts on the values
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('useParams() receives params from samples', async () => {
      const result = await prerender('/params/valid-use-params/[one]/[two]')
      expect(result.cliOutput).not.toContain('ClientAssertionError')
      expectNoBuildValidationErrors(result)
    })

    it('error - accessing a param not present in samples via useParams()', async () => {
      const result = await prerender(
        '/params/invalid-undeclared-use-params/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-undeclared-use-params/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` array.
           at <unknown> (app/params/invalid-undeclared-use-params/[one]/[two]/params-reader.tsx:6:18)
         4 |
         5 | export function ParamsReader() {
       > 6 |   const params = useParams()
           |                  ^
         7 |   // 'two' is not in the sample's params, so this should error
         8 |   const value = params.two
         9 |   return <div id="result">two: {value}</div> {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-undeclared-use-params/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })

    it('error - accessing a param not present in samples via useParams() and catching the error', async () => {
      const result = await prerender(
        '/params/invalid-undeclared-use-params-caught/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/params/invalid-undeclared-use-params-caught/[one]/[two]" accessed param "two" which is not defined in the \`samples\` of \`unstable_instant\`. Add it to the sample's \`params\` array.
           at <unknown> (app/params/invalid-undeclared-use-params-caught/[one]/[two]/params-reader.tsx:9:29)
          7 |   // 'two' is not in the sample's params, so this should error
          8 |   try {
       >  9 |     const twoValue = params.two
            |                             ^
         10 |     // prevent DCE of unused expression
         11 |     if (Math.random() > 1) {
         12 |       console.log(twoValue) {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/params/invalid-undeclared-use-params-caught/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })
  })

  describe('pathname', () => {
    it('valid - usePathname() on a route without params', async () => {
      const result = await prerender('/pathname/valid-use-pathname-no-params')
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('ClientAssertionError')
    })

    it('valid - usePathname() on a route with params (all provided in samples)', async () => {
      const result = await prerender(
        '/pathname/valid-use-pathname-with-params/[one]/[two]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('ClientAssertionError')
    })

    it('valid - usePathname() on a route inside a route group does not include the group segment', async () => {
      const result = await prerender(
        '/pathname/valid-use-pathname-route-group/(route-group)'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('ClientAssertionError')
    })

    it('valid - usePathname() on a catch-all route', async () => {
      const result = await prerender(
        '/pathname/valid-use-pathname-catch-all/[...catchAll]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('ClientAssertionError')
    })

    it('valid - usePathname() on an optional catch-all route', async () => {
      const result = await prerender(
        '/pathname/valid-use-pathname-optional-catch-all/[[...optionalCatchAll]]'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('ClientAssertionError')
    })

    it('error - usePathname() on a route with params but not all provided in samples', async () => {
      const result = await prerender(
        '/pathname/invalid-use-pathname-missing-params/[one]/[two]'
      )
      expect(extractBuildValidationError(result.cliOutput))
        .toMatchInlineSnapshot(`
       "Error: Route "/pathname/invalid-use-pathname-missing-params/[one]/[two]" called usePathname() but param "two" is not defined in the \`samples\` of \`unstable_instant\`. usePathname() requires all route params to be provided.
           at <unknown> (app/pathname/invalid-use-pathname-missing-params/[one]/[two]/pathname-reader.tsx:7:20)
          5 | export function PathnameReader() {
          6 |   // usePathname() should throw because not all params are provided in samples
       >  7 |   const pathname = usePathname()
            |                    ^
          8 |   return <div id="result">pathname: {pathname}</div>
          9 | }
         10 | {
         digest: 'INSTANT_VALIDATION_ERROR'
       }
       Build-time instant validation failed for route "/pathname/invalid-use-pathname-missing-params/[one]/[two]".
       Stopping prerender due to instant validation errors."
      `)
      expect(result.exitCode).toBe(1)
    })
  })

  describe('samples precedence', () => {
    it('page samples override layout samples', async () => {
      const result = await prerender(
        '/samples-precedence/[slug]/page-overrides'
      )
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })

    it('page inherits samples from layout when it has none', async () => {
      const result = await prerender('/samples-precedence/[slug]/page-inherits')
      expectNoBuildValidationErrors(result)
      expect(result.cliOutput).not.toContain('AssertionError')
    })
  })

  describe('caches', () => {
    it('valid - static prefetch - awaiting a cache in the static stage does not require a suspense boundary', async () => {
      const result = await prerender(
        '/valid-await-cache-without-suspense/static'
      )
      expectNoBuildValidationErrors(result)
    })

    it('valid - runtime prefetch - awaiting a cache in the runtime stage does not require a suspense boundary', async () => {
      const result = await prerender(
        '/valid-await-cache-without-suspense/runtime'
      )
      expectNoBuildValidationErrors(result)
    })

    it('valid - runtime prefetch - awaiting a mix of caches in the static and runtime stages does not require a suspense boundary', async () => {
      const result = await prerender(
        '/valid-await-cache-without-suspense/mixed'
      )
      expectNoBuildValidationErrors(result)
    })

    it('valid - runtime prefetch - awaiting a private cache in the runtime stage does not require a suspense boundary', async () => {
      const result = await prerender(
        '/valid-await-cache-without-suspense/private'
      )
      expectNoBuildValidationErrors(result)
    })
  })
})
