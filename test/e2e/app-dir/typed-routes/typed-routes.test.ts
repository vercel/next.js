import { nextTestSetup } from 'e2e-utils'
import { runNextCommand } from 'next-test-utils'

const expectedDts = `
type AppRoutes = "/" | "/_shop/[[...category]]" | "/dashboard" | "/dashboard/settings" | "/docs/[...slug]" | "/gallery/photo/[id]" | "/project/[slug]"
type AppRouteHandlerRoutes = "/api-test" | "/api/docs/[...slug]" | "/api/shop/[[...category]]" | "/api/users/[id]"
type PageRoutes = "/about" | "/users/[id]"
type LayoutRoutes = "/" | "/dashboard"
type RedirectRoutes = "/blog/[category]/[[...slug]]" | "/project/[slug]"
type RewriteRoutes = "/api-legacy/[version]/[[...endpoint]]" | "/docs-old/[...path]"
type Routes = AppRoutes | PageRoutes | LayoutRoutes | RedirectRoutes | RewriteRoutes | AppRouteHandlerRoutes
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
    const dts = await next.readFile(`${next.distDir}/types/routes.d.ts`)
    expect(dts).toContain(expectedDts)
  })

  it('should correctly convert custom route patterns from path-to-regexp to bracket syntax', async () => {
    const dts = await next.readFile(`${next.distDir}/types/routes.d.ts`)

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

      const routeTypesContent = await next.readFile(
        `${next.distDir}/types/routes.d.ts`
      )

      expect(routeTypesContent).toContain(
        'type LayoutRoutes = "/" | "/dashboard" | "/new-layout"'
      )
    })
  }

  it('should generate RouteContext type for route handlers', async () => {
    const dts = await next.readFile(`${next.distDir}/types/routes.d.ts`)
    expect(dts).toContain(
      'interface RouteContext<AppRouteHandlerRoute extends AppRouteHandlerRoutes>'
    )
    expect(dts).toContain('params: Promise<ParamMap[AppRouteHandlerRoute]>')
  })

  if (isNextStart) {
    it('should throw type errors', async () => {
      await next.stop()
      await next.patchFile(
        'app/type-testing.ts',
        `type ValidPage = PageProps<'/dashboard'>
type InvalidPage = PageProps<'/dasboard'>
type ValidRoute = RouteContext<'/api/users/[id]'>
type InvalidRoute = RouteContext<'/api/users/invalid'>`
      )

      const { cliOutput } = await next.build()
      // clean up for future tests
      await next.deleteFile('app/type-testing.ts')

      expect(cliOutput).toContain(
        `Type '"/dasboard"' does not satisfy the constraint 'AppRoutes'.`
      )
      expect(cliOutput).toContain(
        `Type '"/api/users/invalid"' does not satisfy the constraint 'AppRouteHandlerRoutes'.`
      )
    })
  }

  it('should exit typegen successfully', async () => {
    const { code } = await runNextCommand(['typegen'], {
      cwd: next.testDir,
    })

    expect(code).toBe(0)
  })
})
