import { nextTestSetup } from 'e2e-utils'

describe('param-matching-generator-errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  afterEach(async () => {
    await next.stop()
  })

  async function buildRoute(route: string) {
    const { exitCode, cliOutput } = await next.build({
      args: ['--debug-build-paths', `app/[lang]/${route}/[slug]/page.tsx`],
    })
    expect(exitCode).toBe(1)
    return cliOutput
  }

  it.each([
    ['cookies', 'cookies()'],
    ['headers', 'headers()'],
    ['connection', 'connection()'],
    ['draft-mode', 'draftMode()'],
    ['prefetch', 'unstable_prefetch()'],
    ['navigation', 'unstable_navigation()'],
  ])(
    'names the matching generator when %s is unavailable',
    async (route, api) => {
      const output = await buildRoute(route)
      expect(output).toContain(
        `Route /[lang]/${route}/[slug] used \`${api}\` inside \`experimental_generateParamMatching\`. This is not supported because \`experimental_generateParamMatching\` runs at build time`
      )
    }
  )

  it('names the matching generator when private caching needs a request', async () => {
    const output = await buildRoute('private-cache')
    expect(output).toContain(
      '`"use cache: private"` needs an active request, so it can\'t be used during `experimental_generateParamMatching`'
    )
  })

  it('names the matching generator before the general render-phase revalidation error', async () => {
    const output = await buildRoute('revalidate')
    expect(output).toContain(
      '`revalidatePath("/")` can\'t be called during render, inside a cached function, or inside `experimental_generateParamMatching`'
    )
  })

  it('does not suggest that the matching generator receives parent gSP values', async () => {
    const output = await buildRoute('root-params')
    expect(output).toContain(
      "Route /[lang]/root-params/[slug] used `import('next/root-params').lang()` inside `experimental_generateParamMatching`, but the `lang` parameter is not available in this build-time generator."
    )
    expect(output).not.toContain('was not provided by a parent')
  })
})
