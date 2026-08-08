import path from 'path'
import { nextTestSetup } from 'e2e-utils'

function getTreeView(cliOutput: string): string {
  let foundStart = false
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    foundStart ||= line.startsWith('Route ')

    if (foundStart) {
      lines.push(line)
    }

    if (line.startsWith('└')) {
      foundStart = false
    }
  }

  return lines.join('\n').trim()
}

describe('debug-build-paths', () => {
  describe('default fixture', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/default'),
      skipStart: true,
      env: {
        __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      },
    })

    describe('explicit path formats', () => {
      it('should build single page with pages/ prefix', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'pages/foo.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)
        expect(buildResult.cliOutput).toBeDefined()

        // Should only build the specified page
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (pages)
         ┌ ○ /404
         └ ○ /foo"
        `)
      })

      it('should build multiple pages routes', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'pages/foo.tsx,pages/bar.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)
        expect(buildResult.cliOutput).toBeDefined()

        // Should build both specified pages
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (pages)
         ┌ ○ /404
         ├ ○ /bar
         └ ○ /foo"
        `)
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
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         └ ƒ /blog/[slug]"
        `)
      })
    })

    describe('glob pattern matching', () => {
      it('should match app and pages routes with glob patterns', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'pages/**/*.tsx,app/page.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)
        expect(buildResult.cliOutput).toBeDefined()

        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /
         └ ○ /_not-found
         Route (pages)
         ┌ ○ /bar
         ├ ○ /foo
         └ ○ /with-index"
        `)
      })

      it('should match nested routes with app/blog/**/page.tsx pattern', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'app/blog/**/page.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)
        expect(buildResult.cliOutput).toBeDefined()

        // Should build the blog route
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         ├ ƒ /blog/[slug]
         └ ƒ /blog/[slug]/comments"
        `)
      })

      it('should match dynamic routes with glob before brackets like app/**/[slug]/page.tsx', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'app/**/[slug]/page.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)
        expect(buildResult.cliOutput).toBeDefined()

        // Should build the blog/[slug] route
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         └ ƒ /blog/[slug]"
        `)
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
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         ├ ƒ /blog/[slug]
         └ ƒ /blog/[slug]/comments"
        `)
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
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /
         ├ ○ /_not-found
         ├ ○ /about
         ├ ƒ /blog/[slug]
         ├ ƒ /blog/[slug]/comments
         └ ○ /dashboard"
        `)
      })

      it('should exclude paths matching negation patterns', async () => {
        const buildResult = await next.build({
          args: [
            '--debug-build-paths',
            'app/**/page.tsx,!app/with-type-error/**',
          ],
        })
        expect(buildResult.exitCode).toBe(0)

        expect(buildResult.cliOutput).toContain('Route (app)')
        expect(buildResult.cliOutput).toContain('○ /')
        expect(buildResult.cliOutput).toContain('○ /about')
        expect(buildResult.cliOutput).toContain('○ /dashboard')
        expect(buildResult.cliOutput).toContain('/blog/[slug]')
        expect(buildResult.cliOutput).not.toContain('/with-type-error')
      })

      it('should exclude dynamic route paths with negation', async () => {
        const buildResult = await next.build({
          args: [
            '--debug-build-paths',
            'app/blog/**/page.tsx,!app/blog/[slug]/comments/**',
          ],
        })
        expect(buildResult.exitCode).toBe(0)

        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         └ ƒ /blog/[slug]"
        `)
      })

      it('should support multiple negation patterns', async () => {
        const buildResult = await next.build({
          args: [
            '--debug-build-paths',
            'app/**/page.tsx,!app/with-type-error/**,!app/dashboard/**',
          ],
        })
        expect(buildResult.exitCode).toBe(0)

        expect(buildResult.cliOutput).toContain('Route (app)')
        expect(buildResult.cliOutput).toContain('○ /')
        expect(buildResult.cliOutput).toContain('○ /about')
        expect(buildResult.cliOutput).not.toContain('/with-type-error')
        expect(buildResult.cliOutput).not.toContain('○ /dashboard')
      })

      it('should build everything except excluded paths when only negation patterns are provided', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', '!app/with-type-error/**'],
        })
        expect(buildResult.exitCode).toBe(0)

        expect(buildResult.cliOutput).toContain('Route (app)')
        expect(buildResult.cliOutput).toContain('Route (pages)')
        expect(buildResult.cliOutput).toContain('○ /')
        expect(buildResult.cliOutput).toContain('○ /about')
        expect(buildResult.cliOutput).toContain('○ /foo')
        expect(buildResult.cliOutput).not.toContain('/with-type-error')
      })

      it('should build routes inside route groups', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'app/(group)/**/page.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)

        // Route groups are stripped from the path, so /nested instead of /(group)/nested
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         └ ○ /nested"
        `)
      })

      it('should build routes with parallel routes', async () => {
        const buildResult = await next.build({
          args: ['--debug-build-paths', 'app/parallel-test/**/page.tsx'],
        })
        expect(buildResult.exitCode).toBe(0)
        // Parallel route segments (@sidebar) are stripped from the path
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (app)
         ┌ ○ /_not-found
         └ ○ /parallel-test"
        `)
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
        expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
         "Route (pages)
         ┌ ○ /404
         └ ○ /foo"
        `)
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

  describe('src-dir fixture', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/src-dir'),
      skipStart: true,
      env: {
        __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      },
    })

    it('should resolve app patterns with explicit src/ prefix', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'src/app/blog/[slug]/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)
       ┌ ○ /_not-found
       └ ƒ /blog/[slug]"
      `)
    })

    it('should resolve app patterns without src/ prefix when project uses src/app', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/blog/[slug]/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)
       ┌ ○ /_not-found
       └ ƒ /blog/[slug]"
      `)
    })

    it('should resolve pages patterns without src/ prefix when project uses src/pages', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'pages/foo.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
       "Route (pages)
       ┌ ○ /404
       └ ○ /foo"
      `)
    })

    it('should resolve glob patterns without src/ prefix when project uses src/app', async () => {
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/(group)/**/page.tsx'],
      })
      expect(buildResult.exitCode).toBe(0)
      expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)
       ┌ ○ /_not-found
       └ ○ /nested"
      `)
    })
  })

  describe('with-compile-error fixture', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/with-compile-error'),
      skipStart: true,
      env: {
        __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      },
    })

    it('should skip compilation of excluded routes with compile errors', async () => {
      // Build only the valid page, excluding the broken page
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/valid/page.tsx'],
      })
      // Build should succeed because the broken page is not compiled
      expect(getTreeView(buildResult.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)
       ┌ ○ /_not-found
       └ ○ /valid"
      `)
    })

    it('should fail compilation when route with compile error is included', async () => {
      // Build all app routes including the one with compile error
      const buildResult = await next.build({
        args: ['--debug-build-paths', 'app/**/page.tsx'],
      })
      // Build should fail due to compile error in broken/page.tsx
      expect(buildResult.exitCode).toBe(1)
      expect(buildResult.cliOutput).toMatch(/error|Error/)
    })
  })
})
