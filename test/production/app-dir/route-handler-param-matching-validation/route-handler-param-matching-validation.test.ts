import { nextTestSetup } from 'e2e-utils'

describe('route-handler-param-matching-validation', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it.each([
    "export const unstable_paramMatching = { __metadata_id__: 'not-found' }",
    "export function unstable_generateParamMatching() { return { __metadata_id__: 'not-found' } }",
  ])(
    'rejects matching for a compiler-generated metadata ID: %s',
    async (declaration) => {
      const file = 'app/opengraph-image.js'
      const source = await next.readFile(file)
      try {
        await next.patchFile(file, `${declaration}\n${source}`)
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain('Invalid parameter "__metadata_id__"')
        expect(cliOutput).toContain('/opengraph-image/[__metadata_id__]')
      } finally {
        await next.patchFile(file, source)
      }
    }
  )

  it.each([
    [
      "export const unstable_paramMatching = { slug: 'blocking' }",
      'only support "not-found" and "dynamic"',
    ],
    [
      "export const unstable_paramMatching = { slug: 'fallback' }",
      'only support "not-found" and "dynamic"',
    ],
    [
      "export const unstable_paramMatching = { other: 'not-found' }",
      'Invalid parameter "other"',
    ],
    [
      "export const unstable_paramMatching = { slug: 'dynamic' }",
      'cannot prerender parameter "slug"',
    ],
    [
      "export const unstable_paramMatching = { slug: 'not-found' }; export function unstable_generateParamMatching() { return {} }",
      'cannot export both',
    ],
  ])(
    'rejects invalid handler declarations: %s',
    async (declaration, message) => {
      await next.patchFile(
        'app/[slug]/route.js',
        `${declaration}
export function generateStaticParams() { return [{ slug: 'allowed' }] }
export function GET() { return new Response('allowed') }
`
      )
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(message)
    }
  )
  it('requires Cache Components for handler matching', async () => {
    await next.patchFile(
      'app/[slug]/route.js',
      `
export const unstable_paramMatching = { slug: 'not-found' }
export function generateStaticParams() { return [{ slug: 'allowed' }] }
export function GET() { return new Response('allowed') }
`
    )
    const config = await next.readFile('next.config.ts')
    try {
      await next.patchFile(
        'next.config.ts',
        config.replace(
          'cacheComponents: true',
          'cacheComponents: false, experimental: { cachedNavigations: false }'
        )
      )
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        'cannot use parameter matching without enabling'
      )
    } finally {
      await next.patchFile('next.config.ts', config)
    }
  })
})
