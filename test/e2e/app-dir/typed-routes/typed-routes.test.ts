import { nextTestSetup } from 'e2e-utils'

const expectedDts = `
type AppRoutes = "/" | "/_shop/[[...category]]" | "/dashboard" | "/dashboard/settings" | "/docs/[...slug]" | "/gallery/photo/[id]" | "/project/[slug]"
type AppRouteHandlerRoutes = never
type PageRoutes = "/about" | "/users/[id]"
type LayoutRoutes = "/" | "/dashboard"
type RedirectRoutes = "/blog/[category]/[[...slug]]" | "/project/[slug]"
type RewriteRoutes = "/api-legacy/[version]/[[...endpoint]]" | "/docs-old/[...path]"
type Routes = AppRoutes | AppRouteHandlerRoutes | PageRoutes | LayoutRoutes | RedirectRoutes | RewriteRoutes
`

describe('typed-routes', () => {
  const { next, isNextDev, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should generate route types correctly', async () => {
    const dts = await next.readFile('.next/types/routes.d.ts')
    expect(dts).toContain(expectedDts)
  })

  it('should correctly convert custom route patterns from path-to-regexp to bracket syntax', async () => {
    const dts = await next.readFile('.next/types/routes.d.ts')

    // Test standard dynamic segment: :slug -> [slug]
    expect(dts).toContain('"/project/[slug]"')

    // Test catch-all one-or-more: :path+ -> [...path]
    expect(dts).toContain('"/docs-old/[...path]"')

    // Test catch-all zero-or-more: :slug* -> [[...slug]]
    expect(dts).toContain('"/blog/[category]/[[...slug]]"')
    expect(dts).toContain('"/api-legacy/[version]/[[...endpoint]]"')
  })

  if (isNextDev) {
    it('should update route types file when routes change', async () => {
      // Create a new layout file
      await next.patchFile(
        'app/new-layout/layout.tsx',
        `
      export default function NewLayout() {
        return <div>New Layout</div>
      }
    `
      )

      const routeTypesContent = await next.readFile('.next/types/routes.d.ts')

      expect(routeTypesContent).toContain(
        'type LayoutRoutes = "/" | "/dashboard" | "/new-layout"'
      )
    })
  }

  if (isNextStart) {
    it('should throw type errors', async () => {
      await next.stop()
      await next.patchFile(
        'app/type-testing.ts',
        `type ValidPage = PageProps<'/dashboard'>
type InvalidPage = PageProps<'/dasboard'>`
      )

      const { cliOutput } = await next.build()

      expect(cliOutput).toContain(
        `Type '"/dasboard"' does not satisfy the constraint 'AppRoutes'.`
      )
    })
  }
})
