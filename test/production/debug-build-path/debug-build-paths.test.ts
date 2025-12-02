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
  })
})
