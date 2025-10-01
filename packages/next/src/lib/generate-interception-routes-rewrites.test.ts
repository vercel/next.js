import type { Rewrite } from './load-custom-routes'
import { generateInterceptionRoutesRewrites } from './generate-interception-routes-rewrites'

/**
 * Helper to create regex matchers from a rewrite object.
 * The router automatically adds ^ and $ anchors to header patterns via matchHas(),
 * so we add them here for testing to match production behavior.
 */
function getRewriteMatchers(rewrite: Rewrite) {
  return {
    sourceRegex: new RegExp(rewrite.regex!),
    headerRegex: new RegExp(`^${rewrite.has![0].value!}$`),
  }
}

describe('generateInterceptionRoutesRewrites', () => {
  describe('(.) same-level interception', () => {
    it('should generate rewrite for root-level slot intercepting root-level route', () => {
      const rewrites = generateInterceptionRoutesRewrites(['/@slot/(.)nested'])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should be the intercepted route (where user navigates TO)
      expect(rewrite.source).toBe('/nested')

      // Destination should be the intercepting route path
      expect(rewrite.destination).toBe('/@slot/(.)nested')

      // The Next-Url header should match routes at the same level as the intercepting route
      // Since @slot is normalized to /, it should match root-level routes
      expect(rewrite.has).toHaveLength(1)
      expect(rewrite.has?.[0].key).toBe('next-url')

      // The regex should match:
      // - / (root)
      // - /nested-link (any root-level route)
      // - /foo (any other root-level route)
      // But NOT:
      // - /foo/bar (nested routes)
      const { headerRegex } = getRewriteMatchers(rewrite)

      expect(headerRegex.test('/')).toBe(true)
      expect(headerRegex.test('/nested-link')).toBe(true)
      expect(headerRegex.test('/foo')).toBe(true)
      expect(headerRegex.test('/foo/bar')).toBe(false)
      expect(headerRegex.test('/a/b/c')).toBe(false)
    })

    it('should generate rewrite for nested route intercepting sibling', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-routes/feed/(.)photos/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should be the intercepted route with named parameter
      expect(rewrite.source).toBe('/intercepting-routes/feed/photos/:nxtPid')

      // Destination should be the intercepting route with the same named parameter
      expect(rewrite.destination).toBe(
        '/intercepting-routes/feed/(.)photos/:nxtPid'
      )

      // Verify the regex in the rewrite can match actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/intercepting-routes/feed/photos/123')).toBe(
        true
      )
      expect(sourceRegex.test('/intercepting-routes/feed/photos/abc')).toBe(
        true
      )

      // The Next-Url header should match routes at /intercepting-routes/feed level
      // Should match routes at the same level
      expect(headerRegex.test('/intercepting-routes/feed')).toBe(true)
      expect(headerRegex.test('/intercepting-routes/feed/nested')).toBe(true)

      // Should NOT match parent or deeper nested routes
      expect(headerRegex.test('/intercepting-routes')).toBe(false)
      expect(headerRegex.test('/intercepting-routes/feed/nested/deep')).toBe(
        false
      )
    })

    it('should handle (.) with dynamic parameters in intercepting route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-siblings/@modal/(.)[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have the [id] parameter with nxtP prefix (from intercepted route)
      // Destination uses the same prefix for parameter substitution
      expect(rewrite.source).toBe('/intercepting-siblings/:nxtPid')
      expect(rewrite.destination).toBe(
        '/intercepting-siblings/@modal/(.):nxtPid'
      )

      // Verify the source regex matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/intercepting-siblings/123')).toBe(true)
      expect(sourceRegex.test('/intercepting-siblings/user-abc')).toBe(true)

      // Should match routes at /intercepting-siblings level
      expect(headerRegex.test('/intercepting-siblings')).toBe(true)
    })

    it('should handle (.) with multiple dynamic parameters', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-routes-dynamic/photos/(.)[author]/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have both parameters with nxtP prefix (from intercepted route)
      // Both source and destination use the same prefixes for proper substitution
      expect(rewrite.source).toBe(
        '/intercepting-routes-dynamic/photos/:nxtPauthor/:nxtPid'
      )
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic/photos/(.):nxtPauthor/:nxtPid'
      )

      // Verify the source regex matches actual URLs with both parameters
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(
        sourceRegex.test('/intercepting-routes-dynamic/photos/john/123')
      ).toBe(true)
      expect(
        sourceRegex.test('/intercepting-routes-dynamic/photos/jane/post-456')
      ).toBe(true)

      // Should match the parent directory
      expect(headerRegex.test('/intercepting-routes-dynamic/photos')).toBe(true)
    })
  })

  describe('(..) one-level-up interception', () => {
    it('should generate header regex that matches child routes for (..) marker', () => {
      // Test WITHOUT catchall sibling - should only match exact level
      const rewritesWithoutCatchall = generateInterceptionRoutesRewrites([
        '/templates/(..)showcase/[...catchAll]',
      ])

      expect(rewritesWithoutCatchall).toHaveLength(1)
      const rewriteWithoutCatchall = rewritesWithoutCatchall[0]

      expect(rewriteWithoutCatchall.source).toBe('/showcase/:nxtPcatchAll*')
      expect(rewriteWithoutCatchall.destination).toBe(
        '/templates/(..)showcase/:nxtPcatchAll*'
      )

      const { headerRegex: headerWithoutCatchall } = getRewriteMatchers(
        rewriteWithoutCatchall
      )

      // Without catchall sibling: should match exact level only
      expect(headerWithoutCatchall.test('/templates')).toBe(true)
      expect(headerWithoutCatchall.test('/templates/multi')).toBe(false)
      expect(headerWithoutCatchall.test('/templates/multi/slug')).toBe(false)

      // Test WITH catchall sibling - should match exact level AND catchall paths
      const rewritesWithCatchall = generateInterceptionRoutesRewrites([
        '/templates/(..)showcase/[...catchAll]',
        '/templates/[...catchAll]', // Catchall sibling at same level
      ])

      expect(rewritesWithCatchall).toHaveLength(1)
      const rewriteWithCatchall = rewritesWithCatchall[0]

      const { headerRegex: headerWithCatchall } =
        getRewriteMatchers(rewriteWithCatchall)

      // With catchall sibling: should match exact level AND catchall paths
      expect(headerWithCatchall.test('/templates')).toBe(true)
      expect(headerWithCatchall.test('/templates/multi')).toBe(true)
      expect(headerWithCatchall.test('/templates/multi/slug')).toBe(true)
      expect(headerWithCatchall.test('/templates/single')).toBe(true)
      expect(headerWithCatchall.test('/templates/another/slug')).toBe(true)

      // Both should NOT match unrelated routes
      expect(headerWithoutCatchall.test('/other-route')).toBe(false)
      expect(headerWithoutCatchall.test('/showcase/test')).toBe(false)
      expect(headerWithCatchall.test('/other-route')).toBe(false)
      expect(headerWithCatchall.test('/showcase/test')).toBe(false)
    })

    it('should generate rewrite for parallel modal intercepting one level up', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/(group)/intercepting-parallel-modal/[username]/@modal/(..)photo/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source is the intercepted route
      // Note: photo is at /intercepting-parallel-modal/photo, not /photo
      // because it's inside the intercepting-parallel-modal directory
      expect(rewrite.source).toBe('/intercepting-parallel-modal/photo/:nxtPid')

      // Destination should include the full intercepting path (with route group)
      expect(rewrite.destination).toBe(
        '/(group)/intercepting-parallel-modal/:nxtPusername/@modal/(..)photo/:nxtPid'
      )

      // Verify source regex matches actual photo URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/intercepting-parallel-modal/photo/123')).toBe(
        true
      )
      expect(sourceRegex.test('/intercepting-parallel-modal/photo/abc')).toBe(
        true
      )

      // The (..) marker generates a pattern that matches the intercepting route level and its children
      // Should match the intercepting route itself with actual dynamic segment values
      expect(headerRegex.test('/intercepting-parallel-modal/john')).toBe(true)
      expect(headerRegex.test('/intercepting-parallel-modal/jane')).toBe(true)

      // Should not match child routes
      expect(headerRegex.test('/intercepting-parallel-modal/john/child')).toBe(
        false
      )
      expect(
        headerRegex.test('/intercepting-parallel-modal/jane/deep/nested')
      ).toBe(false)

      // Should NOT match parent routes without the required parameter
      expect(headerRegex.test('/intercepting-parallel-modal')).toBe(false)
    })

    it('should generate rewrite with dynamic segment in parent', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[lang]/foo/(..)photos',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source has the dynamic parameter from the parent path
      expect(rewrite.source).toBe('/:nxtPlang/photos')

      // Destination should use the same parameter name
      expect(rewrite.destination).toBe('/:nxtPlang/foo/(..)photos')

      // Verify source regex matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/en/photos')).toBe(true)
      expect(sourceRegex.test('/es/photos')).toBe(true)
      expect(sourceRegex.test('/fr/photos')).toBe(true)

      // Should match child routes of /[lang]/foo with actual parameter values
      // Since the route ends with a static segment (foo), children are required
      expect(headerRegex.test('/en/foo')).toBe(true)
      expect(headerRegex.test('/es/foo')).toBe(true)

      expect(headerRegex.test('/en/foo/bar')).toBe(false)
    })
  })

  describe('(...) root-level interception', () => {
    it('should generate rewrite for root interception from nested route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[locale]/example/@modal/(...)[locale]/intercepted',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source is the intercepted route at root
      expect(rewrite.source).toBe('/:nxtPlocale/intercepted')

      // Destination should include the full intercepting path with parameter
      expect(rewrite.destination).toBe(
        '/:nxtPlocale/example/@modal/(...):nxtPlocale/intercepted'
      )

      // Verify source regex matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/en/intercepted')).toBe(true)
      expect(sourceRegex.test('/es/intercepted')).toBe(true)

      // Should match routes at the intercepting route level
      // The intercepting route is /[locale]/example
      expect(headerRegex.test('/en/example')).toBe(true)
      expect(headerRegex.test('/es/example')).toBe(true)

      // Should NOT match deeper routes
      expect(headerRegex.test('/en/example/nested')).toBe(false)
    })

    it('should generate rewrite for (...) in basepath context', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[foo_id]/[bar_id]/@modal/(...)baz_id/[baz_id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should be the root-level route with parameter (underscores preserved)
      expect(rewrite.source).toBe('/baz_id/:nxtPbaz_id')

      // Destination should include all parameters from both paths (underscores preserved)
      expect(rewrite.destination).toBe(
        '/:nxtPfoo_id/:nxtPbar_id/@modal/(...)baz_id/:nxtPbaz_id'
      )

      // Verify source regex matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/baz_id/123')).toBe(true)
      expect(sourceRegex.test('/baz_id/abc')).toBe(true)

      // Should match the intercepting route level
      expect(headerRegex.test('/foo/bar')).toBe(true)
    })
  })

  describe('(..)(..) two-levels-up interception', () => {
    it('should generate rewrite for two levels up', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/foo/bar/(..)(..)hoge',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source is the intercepted route at root
      expect(rewrite.source).toBe('/hoge')

      // Destination should be the full intercepting path
      expect(rewrite.destination).toBe('/foo/bar/(..)(..)hoge')

      // Verify source regex matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/hoge')).toBe(true)

      // Should match routes at /foo/bar level (two levels below root)
      expect(headerRegex.test('/foo/bar')).toBe(true)

      // Should NOT match parent or deeper routes
      expect(headerRegex.test('/foo')).toBe(false)
      expect(headerRegex.test('/foo/bar/baz')).toBe(false)
    })
  })

  describe('catchall and optional catchall segments', () => {
    it('should generate path-to-regexp format with * suffix for catchall parameters', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/templates/(..)showcase/[...catchAll]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // The key improvement: catchall parameters should get * suffix for path-to-regexp
      expect(rewrite.source).toBe('/showcase/:nxtPcatchAll*')
      expect(rewrite.destination).toBe('/templates/(..)showcase/:nxtPcatchAll*')

      // Test with multiple catchall parameters
      const multiCatchallRewrites = generateInterceptionRoutesRewrites([
        '/blog/[...category]/(..)archives/[...path]',
      ])

      expect(multiCatchallRewrites).toHaveLength(1)
      const multiRewrite = multiCatchallRewrites[0]

      // The source should only contain the intercepted route parameters (path)
      // The intercepting route parameters (category) are not part of the source
      expect(multiRewrite.source).toBe('/blog/archives/:nxtPpath*')
      expect(multiRewrite.destination).toBe(
        '/blog/:nxtPcategory*/(..)archives/:nxtPpath*'
      )
    })

    it('should handle mixed parameter types correctly', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/shop/[category]/(..)products/[id]/reviews/[...path]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should only contain the intercepted route (products/[id]/reviews/[...path])
      // Regular params get no suffix, catchall gets * suffix
      expect(rewrite.source).toBe('/shop/products/:nxtPid/reviews/:nxtPpath*')
      expect(rewrite.destination).toBe(
        '/shop/:nxtPcategory/(..)products/:nxtPid/reviews/:nxtPpath*'
      )
    })

    it('should handle (.) with catchall segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-routes-dynamic-catchall/photos/(.)catchall/[...id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should handle catchall with proper parameter and * suffix
      expect(rewrite.source).toBe(
        '/intercepting-routes-dynamic-catchall/photos/catchall/:nxtPid*'
      )

      // Destination should include the catchall parameter with * suffix
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic-catchall/photos/(.)catchall/:nxtPid*'
      )

      // Verify source regex matches catchall URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(
        sourceRegex.test(
          '/intercepting-routes-dynamic-catchall/photos/catchall/a'
        )
      ).toBe(true)
      expect(
        sourceRegex.test(
          '/intercepting-routes-dynamic-catchall/photos/catchall/a/b'
        )
      ).toBe(true)
      expect(
        sourceRegex.test(
          '/intercepting-routes-dynamic-catchall/photos/catchall/a/b/c'
        )
      ).toBe(true)

      // Should match the parent level
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos')
      ).toBe(true)
    })

    it('should handle (.) with optional catchall segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-routes-dynamic-catchall/photos/(.)optional-catchall/[[...id]]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should handle optional catchall with * suffix
      expect(rewrite.source).toBe(
        '/intercepting-routes-dynamic-catchall/photos/optional-catchall/:nxtPid*'
      )

      // Destination should include the optional catchall parameter with * suffix
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic-catchall/photos/(.)optional-catchall/:nxtPid*'
      )

      // Verify source regex matches both with and without segments
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(
        sourceRegex.test(
          '/intercepting-routes-dynamic-catchall/photos/optional-catchall'
        )
      ).toBe(true)
      expect(
        sourceRegex.test(
          '/intercepting-routes-dynamic-catchall/photos/optional-catchall/a'
        )
      ).toBe(true)
      expect(
        sourceRegex.test(
          '/intercepting-routes-dynamic-catchall/photos/optional-catchall/a/b'
        )
      ).toBe(true)

      // Should match the parent level
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos')
      ).toBe(true)
    })
  })

  describe('edge cases with route groups and parallel routes', () => {
    it('should normalize route groups in intercepting route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/(group)/intercepting-parallel-modal/[username]/@modal/(..)photo/[id]',
      ])

      expect(rewrites).toHaveLength(1)

      // Route groups should be normalized away
      // (group) should not appear in the interceptingRoute calculation
      // Note: Router adds ^ and $ anchors automatically via matchHas()
      const { headerRegex } = getRewriteMatchers(rewrites[0])

      // With (..) marker, should match child routes.
      expect(headerRegex.test('/intercepting-parallel-modal/john')).toBe(true)
      expect(headerRegex.test('/intercepting-parallel-modal/jane')).toBe(true)
    })

    it('should ignore @slot prefix when calculating interception level', () => {
      const rewrites = generateInterceptionRoutesRewrites(['/@slot/(.)nested'])

      expect(rewrites).toHaveLength(1)

      // @slot is a parallel route and shouldn't count as a segment
      // So interceptingRoute should be / (root)
      // Note: Router adds ^ and $ anchors automatically via matchHas()
      const { headerRegex } = getRewriteMatchers(rewrites[0])

      // Should match root-level routes
      expect(headerRegex.test('/')).toBe(true)
      expect(headerRegex.test('/nested-link')).toBe(true)
    })

    it('should handle parallel routes at nested levels', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/parallel-layout/(.)sub/[slug]',
      ])

      expect(rewrites).toHaveLength(1)

      // Note: Router adds ^ and $ anchors automatically via matchHas()
      const { headerRegex } = getRewriteMatchers(rewrites[0])

      // Should match routes at /parallel-layout level
      expect(headerRegex.test('/parallel-layout')).toBe(true)
    })
  })

  describe('basePath support', () => {
    it('should include basePath in source and destination but not in header check', () => {
      const rewrites = generateInterceptionRoutesRewrites(
        ['/@slot/(.)nested'],
        '/base'
      )

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source and destination should include basePath
      expect(rewrite.source).toBe('/base/nested')
      expect(rewrite.destination).toBe('/base/@slot/(.)nested')

      // Verify source regex includes basePath and matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/base/nested')).toBe(true)
      expect(sourceRegex.test('/nested')).toBe(false) // Should NOT match without basePath

      // But Next-Url header check should NOT include basePath
      // (comment in code says "The Next-Url header does not contain the base path")

      // Should match root-level routes (without basePath in the check)
      expect(headerRegex.test('/')).toBe(true)
      expect(headerRegex.test('/nested-link')).toBe(true)
      expect(headerRegex.test('/base')).toBe(true) // Matches because it's a root-level route

      // Should NOT match deeply nested routes
      expect(headerRegex.test('/nested-link/deep')).toBe(false)
    })
  })

  describe('special parameter names', () => {
    it('should handle parameters with special characters', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[this-is-my-route]/@intercept/(.)some-page',
      ])

      expect(rewrites).toHaveLength(1)

      // Should properly handle parameter names with hyphens
      // The parameter [this-is-my-route] should be sanitized to "thisismyroute" and prefixed
      expect(rewrites[0].has![0].value).toContain('thisismyroute')
      expect(rewrites[0].has![0].value).toMatch(/\(\?<.*thisismyroute.*>/)

      // Note: Router adds ^ and $ anchors automatically via matchHas()
      const { headerRegex } = getRewriteMatchers(rewrites[0])

      // Should match routes at the parent level
      expect(headerRegex.test('/foo')).toBe(true)
    })
  })

  describe('parameter consistency between source, destination, and regex', () => {
    it('should use consistent parameter names for (.) with dynamic segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/photos/(.)[author]/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Extract parameter names from source (path-to-regexp format)
      const sourceParams = rewrite.source
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(sourceParams).toEqual(['nxtPauthor', 'nxtPid'])

      // Extract parameter names from destination
      const destParams = rewrite.destination
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(destParams).toEqual(['nxtPauthor', 'nxtPid'])

      // Extract capture group names from regex
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])
      expect(regexParams).toEqual(['nxtPauthor', 'nxtPid'])

      // All three should match exactly
      expect(sourceParams).toEqual(destParams)
      expect(sourceParams).toEqual(regexParams)
    })

    it('should use consistent parameter names for (..) with dynamic segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[org]/projects/(..)team/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Extract and verify all parameters match
      const sourceParams = rewrite.source
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      const destParams = rewrite.destination
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])

      // Should have org parameter in source but not in destination (it's above the interception level)
      expect(sourceParams).toEqual(['nxtPorg', 'nxtPid'])
      expect(destParams).toEqual(['nxtPorg', 'nxtPid'])
      expect(regexParams).toEqual(['nxtPorg', 'nxtPid'])

      expect(sourceParams).toEqual(destParams)
      expect(sourceParams).toEqual(regexParams)
    })

    it('should use consistent parameter names for (...) with dynamic segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[locale]/dashboard/@modal/(...)auth/[provider]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // For (...) root interception, source is the intercepted route (at root)
      // Destination includes params from BOTH intercepting route and intercepted route
      expect(rewrite.source).toBe('/auth/:nxtPprovider')
      expect(rewrite.destination).toBe(
        '/:nxtPlocale/dashboard/@modal/(...)auth/:nxtPprovider'
      )

      // Source only has provider (from intercepted route)
      const sourceParams = rewrite.source
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(sourceParams).toEqual(['nxtPprovider'])

      // Destination has both locale (from intercepting route) and provider (from intercepted route)
      const destParams = rewrite.destination
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(destParams).toEqual(['nxtPlocale', 'nxtPprovider'])

      // Regex only matches the source, so only has provider
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])
      expect(regexParams).toEqual(['nxtPprovider'])

      // All should use nxtP prefix
      expect(sourceParams!.every((p) => p.startsWith('nxtP'))).toBe(true)
      expect(destParams!.every((p) => p.startsWith('nxtP'))).toBe(true)
    })

    it('should handle parameter substitution correctly', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/shop/(.)[category]/[productId]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Simulate what the router does:
      // 1. Match the source URL against the regex
      const { sourceRegex } = getRewriteMatchers(rewrite)
      const match = sourceRegex.exec('/shop/electronics/12345')

      expect(match).toBeTruthy()
      expect(match!.groups).toEqual({
        nxtPcategory: 'electronics',
        nxtPproductId: '12345',
      })

      // 2. Extract the named groups
      const params = match!.groups!

      // 3. Verify we can substitute into destination
      let destination = rewrite.destination
      for (const [key, value] of Object.entries(params)) {
        destination = destination.replace(`:${key}`, value)
      }

      expect(destination).toBe('/shop/(.)electronics/12345')
    })

    it('should handle catchall parameters with consistent naming', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/docs/(.)[...slug]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Verify catchall parameters get * suffix in path-to-regexp format
      expect(rewrite.source).toBe('/docs/:nxtPslug*')
      expect(rewrite.destination).toBe('/docs/(.):nxtPslug*')

      const sourceParams = rewrite.source
        .match(/:(\w+)\*?/g)
        ?.map((p) => p.slice(1).replace('*', ''))
      const destParams = rewrite.destination
        .match(/:(\w+)\*?/g)
        ?.map((p) => p.slice(1).replace('*', ''))
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])

      expect(sourceParams).toEqual(['nxtPslug'])
      expect(destParams).toEqual(['nxtPslug'])
      expect(regexParams).toEqual(['nxtPslug'])

      // Test actual matching and substitution
      const { sourceRegex } = getRewriteMatchers(rewrite)
      const match = sourceRegex.exec('/docs/getting-started/installation')

      expect(match).toBeTruthy()
      expect(match!.groups!.nxtPslug).toBe('getting-started/installation')
    })

    it('should handle multiple parameters with mixed types consistently', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/blog/[year]/[month]/(.)[slug]/comments/[...commentPath]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Verify source and destination have correct format with * suffix for catchall
      expect(rewrite.source).toBe(
        '/blog/:nxtPyear/:nxtPmonth/:nxtPslug/comments/:nxtPcommentPath*'
      )
      expect(rewrite.destination).toBe(
        '/blog/:nxtPyear/:nxtPmonth/(.):nxtPslug/comments/:nxtPcommentPath*'
      )

      // All parameters should use nxtP prefix (no nxtI for intercepted route source)
      // Extract parameter names, removing * suffix from catchall
      const sourceParams = rewrite.source
        .match(/:(\w+)\*?/g)
        ?.map((p) => p.slice(1).replace('*', ''))
      const destParams = rewrite.destination
        .match(/:(\w+)\*?/g)
        ?.map((p) => p.slice(1).replace('*', ''))
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])

      expect(sourceParams).toEqual([
        'nxtPyear',
        'nxtPmonth',
        'nxtPslug',
        'nxtPcommentPath',
      ])
      expect(destParams).toEqual([
        'nxtPyear',
        'nxtPmonth',
        'nxtPslug',
        'nxtPcommentPath',
      ])
      expect(regexParams).toEqual([
        'nxtPyear',
        'nxtPmonth',
        'nxtPslug',
        'nxtPcommentPath',
      ])

      expect(sourceParams).toEqual(destParams)
      expect(sourceParams).toEqual(regexParams)
    })

    it('should verify the actual failing case from the bug report', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-routes-dynamic/photos/(.)[author]/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // This is the exact case that was failing
      expect(rewrite.source).toBe(
        '/intercepting-routes-dynamic/photos/:nxtPauthor/:nxtPid'
      )
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic/photos/(.):nxtPauthor/:nxtPid'
      )

      // The bug was: regex had (?<nxtPauthor> but source had :nxtIauthor
      // Now they should match:
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])
      expect(regexParams).toEqual(['nxtPauthor', 'nxtPid'])

      const sourceParams = rewrite.source
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(sourceParams).toEqual(['nxtPauthor', 'nxtPid'])

      // Verify actual URL matching and substitution works
      const { sourceRegex } = getRewriteMatchers(rewrite)
      const match = sourceRegex.exec(
        '/intercepting-routes-dynamic/photos/next/123'
      )

      expect(match).toBeTruthy()
      expect(match!.groups).toEqual({
        nxtPauthor: 'next',
        nxtPid: '123',
      })

      // Verify substitution produces correct destination
      let destination = rewrite.destination
      for (const [key, value] of Object.entries(match!.groups!)) {
        destination = destination.replace(`:${key}`, value)
      }

      expect(destination).toBe(
        '/intercepting-routes-dynamic/photos/(.)next/123'
      )
    })
  })
})
