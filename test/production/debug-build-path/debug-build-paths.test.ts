import { nextTestSetup } from 'e2e-utils'

describe('debug-build-paths', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) return

  describe('explicit path formats', () => {
    it('should build single page with pages/ prefix', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'pages/foo.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should only build the specified page
      expect(buildResult.cliOutput).toContain('Route (pages)')
      expect(buildResult.cliOutput).toContain('○ /foo')
      // Should not build other pages
      expect(buildResult.cliOutput).not.toContain('○ /bar')
      // Should not build app routes
      expect(buildResult.cliOutput).not.toContain('Route (app)')
    })

    it('should build multiple pages routes', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'pages/foo.tsx,pages/bar.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should build both specified pages
      expect(buildResult.cliOutput).toContain('Route (pages)')
      expect(buildResult.cliOutput).toContain('○ /foo')
      expect(buildResult.cliOutput).toContain('○ /bar')
      // Should not build app routes
      expect(buildResult.cliOutput).not.toContain('Route (app)')
    })

    it('should build dynamic route with literal [slug] path', async () => {
      // Test that literal paths with brackets work without escaping
      // The path is checked for file existence before being treated as glob
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/blog/[slug]/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should build only the blog/[slug] route
      expect(buildResult.cliOutput).toContain('Route (app)')
      expect(buildResult.cliOutput).toContain('/blog/[slug]')
      // Should not build other app routes
      expect(buildResult.cliOutput).not.toMatch(/○ \/\n/)
      expect(buildResult.cliOutput).not.toContain('○ /about')
      expect(buildResult.cliOutput).not.toContain('○ /dashboard')
      // Should not build pages routes
      expect(buildResult.cliOutput).not.toContain('Route (pages)')
    })
  })

  describe('glob pattern matching', () => {
    it('should match app and pages routes with glob patterns', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'pages/*.tsx,app/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should build pages matching the glob
      expect(buildResult.cliOutput).toContain('Route (pages)')
      expect(buildResult.cliOutput).toContain('○ /foo')
      expect(buildResult.cliOutput).toContain('○ /bar')

      // Should build the specified app route
      expect(buildResult.cliOutput).toContain('Route (app)')
      expect(buildResult.cliOutput).toContain('○ /')
      // Should not build other app routes
      expect(buildResult.cliOutput).not.toContain('○ /about')
      expect(buildResult.cliOutput).not.toContain('○ /dashboard')
    })

    it('should match nested routes with app/blog/**/page.tsx pattern', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/blog/**/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should build the blog route
      expect(buildResult.cliOutput).toContain('Route (app)')
      expect(buildResult.cliOutput).toContain('/blog/[slug]')
      // Should not build other app routes (check for exact route, not substring)
      expect(buildResult.cliOutput).not.toMatch(/○ \/\n/)
      expect(buildResult.cliOutput).not.toContain('○ /about')
      expect(buildResult.cliOutput).not.toContain('○ /dashboard')
      // Should not build pages routes
      expect(buildResult.cliOutput).not.toContain('Route (pages)')
    })

    it('should match hybrid pattern with literal [slug] and glob **', async () => {
      // Test pattern: app/blog/[slug]/**/page.tsx
      // [slug] should be treated as literal directory (exists on disk)
      // ** should be treated as glob (match any depth)
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/blog/[slug]/**/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should build both blog/[slug] and blog/[slug]/comments routes
      expect(buildResult.cliOutput).toContain('Route (app)')
      expect(buildResult.cliOutput).toContain('/blog/[slug]')
      expect(buildResult.cliOutput).toContain('/blog/[slug]/comments')
      // Should not build other app routes
      expect(buildResult.cliOutput).not.toMatch(/○ \/\n/)
      expect(buildResult.cliOutput).not.toContain('○ /about')
      expect(buildResult.cliOutput).not.toContain('○ /dashboard')
      // Should not build pages routes
      expect(buildResult.cliOutput).not.toContain('Route (pages)')
    })

    it('should match multiple app routes with explicit patterns', async () => {
      const buildResult = await next.build({
        args: [
          '--debug-build-paths',
          'app/page.tsx,app/about/page.tsx,app/dashboard/page.tsx,app/blog/**/page.tsx',
        ],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toBeDefined()

      // Should build specified app routes
      expect(buildResult.cliOutput).toContain('Route (app)')
      expect(buildResult.cliOutput).toContain('○ /')
      expect(buildResult.cliOutput).toContain('○ /about')
      expect(buildResult.cliOutput).toContain('○ /dashboard')
      expect(buildResult.cliOutput).toContain('/blog/[slug]')
      // Should not build routes not specified
      expect(buildResult.cliOutput).not.toContain('/with-type-error')
      // Should not build pages routes
      expect(buildResult.cliOutput).not.toContain('Route (pages)')
    })
  })

  describe('typechecking with debug-build-paths', () => {
    it('should skip typechecking for excluded app routes', async () => {
      // Build only pages routes, excluding app routes with type error
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'pages/foo.tsx'],
      })
      // Build should succeed because the file with type error is not checked
      expect(buildResult.exitCode).toBe(0)
      expect(buildResult.cliOutput).toContain('Route (pages)')
      expect(buildResult.cliOutput).toContain('○ /foo')
      // Should not include app routes
      expect(buildResult.cliOutput).not.toContain('Route (app)')
    })

    it('should fail typechecking when route with type error is included', async () => {
      // Build all app routes including the one with type error
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/**/page.tsx'],
      })
      // Build should fail due to type error in with-type-error/page.tsx
      expect(buildResult.exitCode).toBe(1)
      expect(buildResult.cliOutput).toContain('Type error')
      expect(buildResult.cliOutput).toContain('with-type-error/page.tsx')
    })
  })
})
