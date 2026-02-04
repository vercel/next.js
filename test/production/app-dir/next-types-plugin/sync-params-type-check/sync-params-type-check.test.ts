import { nextTestSetup } from 'e2e-utils'

const strictRouteTypes =
  process.env.__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES === 'true'

// This next-types-plugin feature only works in webpack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'app-dir - sync-params-type-check',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })

    it('should pass build with Promise params', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail build with sync params', async () => {
      await next.patchFile(
        'app/blog/[slug]/page.tsx',
        `
      interface Params { slug: string }
      export default function Page({ params }: { params: Params }) {
        return <p>slug:{params.slug}</p>
      }
      `
      )
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toMatch(
        strictRouteTypes
          ? /Property 'slug' is missing in type 'Promise<{ slug: string; }>'/
          : /Type error: Type '{ params: Params; }' does not satisfy the constraint 'PageProps'/
      )
    })
  }
)
