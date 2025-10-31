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
      // - /foo/bar (nested routes - any descendant of root)
      // Since the intercepting route is at root, it should match when navigating
      // FROM root or any of its descendants
      const { headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(`"^\\/.*$"`)

      expect(headerRegex.test('/')).toBe(true)
      expect(headerRegex.test('/nested-link')).toBe(true)
      expect(headerRegex.test('/foo')).toBe(true)
      expect(headerRegex.test('/foo/bar')).toBe(true)
      expect(headerRegex.test('/a/b/c')).toBe(true)
    })

    it('should generate rewrite for root-level slot intercepting nested route with dynamic segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/@modal/(.)groups/[id]/new',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should be the intercepted route
      expect(rewrite.source).toBe('/groups/:nxtPid/new')

      // Destination should be the intercepting route path
      expect(rewrite.destination).toBe('/@modal/(.)groups/:nxtPid/new')

      // The Next-Url header should match routes at root level and all descendants
      // This is the bug fix: should match /groups/123 (nested route) in addition to / and /groups
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(`"^\\/.*$"`)

      // Source should match the target URL with dynamic parameter
      expect(sourceRegex.test('/groups/123/new')).toBe(true)
      expect(sourceRegex.test('/groups/abc/new')).toBe(true)

      // Header should match when navigating FROM root or any descendant
      expect(headerRegex.test('/')).toBe(true) // From root
      expect(headerRegex.test('/groups')).toBe(true) // From /groups
      expect(headerRegex.test('/groups/123')).toBe(true) // From /groups/123 (THE BUG FIX!)
      expect(headerRegex.test('/groups/123/settings')).toBe(true) // From any nested route
      expect(headerRegex.test('/other/route/deep')).toBe(true) // From any other route
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-routes\\/feed(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/intercepting-routes/feed/photos/123')).toBe(
        true
      )
      expect(sourceRegex.test('/intercepting-routes/feed/photos/abc')).toBe(
        true
      )

      // The Next-Url header should match routes at /intercepting-routes/feed level
      // Should match routes at the same level and ALL descendants
      expect(headerRegex.test('/intercepting-routes/feed')).toBe(true)
      expect(headerRegex.test('/intercepting-routes/feed/nested')).toBe(true)
      expect(headerRegex.test('/intercepting-routes/feed/nested/deep')).toBe(
        true
      )

      // Should NOT match parent routes
      expect(headerRegex.test('/intercepting-routes')).toBe(false)
    })

    it('should handle (.) with dynamic parameters in intercepting route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-siblings/@modal/(.)[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have the [id] parameter with nxtI prefix (adjacent to interception marker)
      // Destination uses the same prefix for parameter substitution
      expect(rewrite.source).toBe('/intercepting-siblings/:nxtIid')
      expect(rewrite.destination).toBe(
        '/intercepting-siblings/@modal/(.):nxtIid'
      )

      // Verify the source regex matches actual URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-siblings(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/intercepting-siblings/123')).toBe(true)
      expect(sourceRegex.test('/intercepting-siblings/user-abc')).toBe(true)

      // Should match routes at /intercepting-siblings level and all descendants
      expect(headerRegex.test('/intercepting-siblings')).toBe(true)
      expect(headerRegex.test('/intercepting-siblings/123')).toBe(true)
      expect(headerRegex.test('/intercepting-siblings/123/nested')).toBe(true)
    })

    it('should handle (.) with multiple dynamic parameters', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/intercepting-routes-dynamic/photos/(.)[author]/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have nxtI prefix for author (adjacent to marker), nxtP for id
      // Both source and destination use the same prefixes for proper substitution
      expect(rewrite.source).toBe(
        '/intercepting-routes-dynamic/photos/:nxtIauthor/:nxtPid'
      )
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic/photos/(.):nxtIauthor/:nxtPid'
      )

      // Verify the source regex matches actual URLs with both parameters
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-routes\\-dynamic\\/photos(?:\\/.*)?$"`
      )

      expect(
        sourceRegex.test('/intercepting-routes-dynamic/photos/john/123')
      ).toBe(true)
      expect(
        sourceRegex.test('/intercepting-routes-dynamic/photos/jane/post-456')
      ).toBe(true)

      // Should match the parent directory and all descendants
      expect(headerRegex.test('/intercepting-routes-dynamic/photos')).toBe(true)
      expect(headerRegex.test('/intercepting-routes-dynamic/photos/john')).toBe(
        true
      )
      expect(
        headerRegex.test('/intercepting-routes-dynamic/photos/john/123')
      ).toBe(true)
    })

    it('should handle (.) with optional catchall in intercepting route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/(.)settings',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have optional catchall parameter with * suffix
      expect(rewrite.source).toBe('/:nxtPlocale*/settings')

      // Destination should use the same parameter with * suffix
      // The marker (.) comes after the parameter in the destination
      expect(rewrite.destination).toBe('/:nxtPlocale*/(.)settings')

      // Verify source regex matches actual URLs with 0 or more catchall segments
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/settings')).toBe(true)
      expect(sourceRegex.test('/en/settings')).toBe(true)
      expect(sourceRegex.test('/en/us/settings')).toBe(true)

      // Header should match routes at the same level as the intercepting route
      // The optional catchall can match zero or more segments
      expect(headerRegex.test('/')).toBe(true) // Zero locale segments (root level)
      expect(headerRegex.test('/en')).toBe(true) // One locale segment
      expect(headerRegex.test('/en/us')).toBe(true) // Multiple locale segments

      // Should match direct children at each level (same-level interception allows one child)
      expect(headerRegex.test('/other-page')).toBe(true) // Direct child at root
      expect(headerRegex.test('/en/settings')).toBe(true) // Direct child at /en level
      expect(headerRegex.test('/en/us/nested')).toBe(true) // Direct child at /en/us level

      // With optional catchall, any depth of catchall + one child is valid
      expect(headerRegex.test('/en/settings/deep')).toBe(true) // /en/settings level + child
      expect(headerRegex.test('/en/us/nested/deeper')).toBe(true) // /en/us/nested level + child

      // Should NOT match when there's no valid "catchall + child" or "just catchall" interpretation
      expect(headerRegex.test('/a/b/c/d/e')).toBe(true) // Actually matches: /a/b/c/d as catchall + /e as child
    })
  })

  describe('(..) one-level-up interception', () => {
    it('should handle (..) from exactly 2 levels deep', () => {
      // Boundary: /foo/bar with (..) goes to /foo (not root)
      const rewrites = generateInterceptionRoutesRewrites([
        '/foo/bar/(..)target',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      expect(rewrite.source).toBe('/foo/target')
      expect(rewrite.destination).toBe('/foo/bar/(..)target')

      const { headerRegex } = getRewriteMatchers(rewrite)

      // Should match at /foo/bar level
      expect(headerRegex.test('/foo/bar')).toBe(true)
      expect(headerRegex.test('/foo/bar/nested')).toBe(true)

      // Should NOT match at /foo level (that's the parent)
      expect(headerRegex.test('/foo')).toBe(false)
    })

    it('should handle (..) with dynamic segment at boundary (2 levels to 1)', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[locale]/dashboard/(..)settings',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // (..) from /[locale]/dashboard goes to /[locale]
      expect(rewrite.source).toBe('/:nxtPlocale/settings')
      expect(rewrite.destination).toBe('/:nxtPlocale/dashboard/(..)settings')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/en/settings')).toBe(true)
      expect(sourceRegex.test('/fr/settings')).toBe(true)

      // Header should match at /[locale]/dashboard level
      expect(headerRegex.test('/en/dashboard')).toBe(true)
      expect(headerRegex.test('/fr/dashboard')).toBe(true)
    })

    it('should handle (..) with catchall at boundary', () => {
      // /[...all]/item with (..) removes one segment, leaving /[...all]
      const rewrites = generateInterceptionRoutesRewrites([
        '/[...all]/item/(..)target',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // (..) from /[...all]/item removes one segment, leaving /[...all]
      expect(rewrite.source).toBe('/:nxtPall+/target')
      expect(rewrite.destination).toBe('/:nxtPall+/item/(..)target')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/a/target')).toBe(true)
      expect(sourceRegex.test('/a/b/target')).toBe(true)

      // Header should match from /[...all]/item at any depth
      expect(headerRegex.test('/a/item')).toBe(true)
      expect(headerRegex.test('/a/b/item')).toBe(true)
      expect(headerRegex.test('/a/b/c/item')).toBe(true)
    })

    it('should generate header regex that matches child routes for (..) marker', () => {
      // Test WITHOUT catchall sibling - should only match exact level
      const rewritesWithoutCatchall = generateInterceptionRoutesRewrites([
        '/templates/(..)showcase/[...catchAll]',
      ])

      expect(rewritesWithoutCatchall).toHaveLength(1)
      const rewriteWithoutCatchall = rewritesWithoutCatchall[0]

      expect(rewriteWithoutCatchall.source).toBe('/showcase/:nxtPcatchAll+')
      expect(rewriteWithoutCatchall.destination).toBe(
        '/templates/(..)showcase/:nxtPcatchAll+'
      )

      const { headerRegex: headerWithoutCatchall } = getRewriteMatchers(
        rewriteWithoutCatchall
      )
      expect(headerWithoutCatchall.source).toMatchInlineSnapshot(
        `"^\\/templates(?:\\/.*)?$"`
      )

      // Now matches all descendants (consistent with other markers)
      expect(headerWithoutCatchall.test('/templates')).toBe(true)
      expect(headerWithoutCatchall.test('/templates/multi')).toBe(true)
      expect(headerWithoutCatchall.test('/templates/multi/slug')).toBe(true)

      // Test WITH catchall sibling - should match exact level AND catchall paths
      const rewritesWithCatchall = generateInterceptionRoutesRewrites([
        '/templates/(..)showcase/[...catchAll]',
        '/templates/[...catchAll]', // Catchall sibling at same level
      ])

      expect(rewritesWithCatchall).toHaveLength(1)
      const rewriteWithCatchall = rewritesWithCatchall[0]

      const { headerRegex: headerWithCatchall } =
        getRewriteMatchers(rewriteWithCatchall)
      expect(headerWithCatchall.source).toMatchInlineSnapshot(
        `"^\\/templates(?:\\/.*)?$"`
      )

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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-parallel\\-modal\\/(?<nxtPusername>[^/]+?)(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/intercepting-parallel-modal/photo/123')).toBe(
        true
      )
      expect(sourceRegex.test('/intercepting-parallel-modal/photo/abc')).toBe(
        true
      )

      // The (..) marker matches the intercepting route level and all descendants
      // Should match the intercepting route itself with actual dynamic segment values
      expect(headerRegex.test('/intercepting-parallel-modal/john')).toBe(true)
      expect(headerRegex.test('/intercepting-parallel-modal/jane')).toBe(true)

      // Should also match all descendants
      expect(headerRegex.test('/intercepting-parallel-modal/john/child')).toBe(
        true
      )
      expect(
        headerRegex.test('/intercepting-parallel-modal/jane/deep/nested')
      ).toBe(true)

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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/(?<nxtPlang>[^/]+?)\\/foo(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/en/photos')).toBe(true)
      expect(sourceRegex.test('/es/photos')).toBe(true)
      expect(sourceRegex.test('/fr/photos')).toBe(true)

      // Should match routes at /[lang]/foo level and all descendants
      expect(headerRegex.test('/en/foo')).toBe(true)
      expect(headerRegex.test('/es/foo')).toBe(true)
      expect(headerRegex.test('/en/foo/bar')).toBe(true)
      expect(headerRegex.test('/es/foo/nested/deep')).toBe(true)
    })

    it('should handle (..) with optional catchall in intercepting route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/dashboard/(..)settings',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have optional catchall parameter with * suffix (from shared parent)
      expect(rewrite.source).toBe('/:nxtPlocale*/settings')

      // Destination should use the same parameter with * suffix
      expect(rewrite.destination).toBe('/:nxtPlocale*/dashboard/(..)settings')

      // Verify source regex matches actual URLs with 0 or more catchall segments
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?\\/dashboard(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/settings')).toBe(true)
      expect(sourceRegex.test('/en/settings')).toBe(true)
      expect(sourceRegex.test('/en/us/settings')).toBe(true)

      // Header should match routes at the intercepting route level (/[[...locale]]/dashboard)
      // The optional catchall can match zero or more segments
      expect(headerRegex.test('/dashboard')).toBe(true) // Zero locale segments
      expect(headerRegex.test('/en/dashboard')).toBe(true) // One locale segment
      expect(headerRegex.test('/en/us/dashboard')).toBe(true) // Multiple locale segments
    })

    it('should handle (..) with optional catchall and catchall sibling', () => {
      // Test WITH catchall sibling - should match exact level AND catchall paths
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/dashboard/(..)settings',
        '/[[...locale]]/dashboard/[...slug]', // Catchall sibling at dashboard level
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      expect(rewrite.source).toBe('/:nxtPlocale*/settings')
      expect(rewrite.destination).toBe('/:nxtPlocale*/dashboard/(..)settings')

      const { headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?\\/dashboard(?:\\/.*)?$"`
      )

      // With catchall sibling: should match exact level AND catchall paths
      // Optional catchall allows zero segments
      expect(headerRegex.test('/dashboard')).toBe(true) // Zero locale segments
      expect(headerRegex.test('/en/dashboard')).toBe(true) // One locale segment
      expect(headerRegex.test('/en/us/dashboard')).toBe(true) // Multiple locale segments

      // With catchall sibling, should also match nested paths under the level
      expect(headerRegex.test('/dashboard/foo')).toBe(true)
      expect(headerRegex.test('/en/dashboard/foo')).toBe(true)
      expect(headerRegex.test('/en/us/dashboard/foo/bar')).toBe(true)
    })

    it('should handle (..) with multiple dynamic segments including optional catchall', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/[userId]/(..)profile',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source should have both parameters
      expect(rewrite.source).toBe('/:nxtPlocale*/profile')

      // Destination should have both parameters
      expect(rewrite.destination).toBe('/:nxtPlocale*/:nxtPuserId/(..)profile')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?\\/(?<nxtPuserId>[^/]+?)(?:\\/.*)?$"`
      )

      // Source should match with 0 or more locale segments
      expect(sourceRegex.test('/profile')).toBe(true)
      expect(sourceRegex.test('/en/profile')).toBe(true)
      expect(sourceRegex.test('/en/us/profile')).toBe(true)

      // Header should match the intercepting route level
      // Optional catchall + required userId
      expect(headerRegex.test('/user123')).toBe(true)
      expect(headerRegex.test('/en/user123')).toBe(true)
      expect(headerRegex.test('/en/us/user123')).toBe(true)
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/(?<nxtIlocale>[^/]+?)\\/example(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/en/intercepted')).toBe(true)
      expect(sourceRegex.test('/es/intercepted')).toBe(true)

      // Should match routes at the intercepting route level and all descendants
      // The intercepting route is /[locale]/example
      expect(headerRegex.test('/en/example')).toBe(true)
      expect(headerRegex.test('/es/example')).toBe(true)
      expect(headerRegex.test('/en/example/nested')).toBe(true)
      expect(headerRegex.test('/es/example/nested/deep')).toBe(true)
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/(?<nxtPfoo_id>[^/]+?)\\/(?<nxtPbar_id>[^/]+?)(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/baz_id/123')).toBe(true)
      expect(sourceRegex.test('/baz_id/abc')).toBe(true)

      // Should match the intercepting route level and all descendants
      expect(headerRegex.test('/foo/bar')).toBe(true)
      expect(headerRegex.test('/foo/bar/nested')).toBe(true)
    })

    it('should handle (...) with optional catchall in intercepted route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/dashboard/@modal/(...)[[...locale]]/intercepted',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source is the intercepted route at root with optional catchall
      expect(rewrite.source).toBe('/:nxtPlocale*/intercepted')

      // Destination should include all parameters from both paths
      expect(rewrite.destination).toBe(
        '/:nxtPlocale*/dashboard/@modal/(...):nxtPlocale*/intercepted'
      )

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(sourceRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtIlocale>.+?))?\\/intercepted(?:\\/)?$"`
      )
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtIlocale>.+?))?\\/dashboard(?:\\/.*)?$"`
      )

      // Source should match with 0 or more locale segments
      expect(sourceRegex.test('/intercepted')).toBe(true)
      expect(sourceRegex.test('/en/intercepted')).toBe(true)
      expect(sourceRegex.test('/en/us/intercepted')).toBe(true)

      // Header should match routes at the intercepting route level
      // The intercepting route is /[[...locale]]/dashboard
      expect(headerRegex.test('/dashboard')).toBe(true)
      expect(headerRegex.test('/en/dashboard')).toBe(true)
      expect(headerRegex.test('/en/us/dashboard')).toBe(true)
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/foo\\/bar(?:\\/.*)?$"`
      )

      expect(sourceRegex.test('/hoge')).toBe(true)

      // Should match routes at /foo/bar level and all descendants
      expect(headerRegex.test('/foo/bar')).toBe(true)
      expect(headerRegex.test('/foo/bar/baz')).toBe(true)
      expect(headerRegex.test('/foo/bar/baz/deep')).toBe(true)

      // Should NOT match parent routes
      expect(headerRegex.test('/foo')).toBe(false)
    })

    it('should handle (..)(..) with optional catchall in intercepting route', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/foo/bar/(..)(..)hoge',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source is the intercepted route two levels up
      expect(rewrite.source).toBe('/:nxtPlocale*/hoge')

      // Destination should include the full intercepting path
      expect(rewrite.destination).toBe('/:nxtPlocale*/foo/bar/(..)(..)hoge')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?\\/foo\\/bar(?:\\/.*)?$"`
      )

      // Source should match with 0 or more locale segments
      expect(sourceRegex.test('/hoge')).toBe(true)
      expect(sourceRegex.test('/en/hoge')).toBe(true)
      expect(sourceRegex.test('/en/us/hoge')).toBe(true)

      // Header should match routes at /[[...locale]]/foo/bar level and all descendants
      expect(headerRegex.test('/foo/bar')).toBe(true)
      expect(headerRegex.test('/en/foo/bar')).toBe(true)
      expect(headerRegex.test('/en/us/foo/bar')).toBe(true)
      expect(headerRegex.test('/foo/bar/baz')).toBe(true)
      expect(headerRegex.test('/en/foo/bar/baz')).toBe(true)
      expect(headerRegex.test('/en/us/foo/bar/nested/deep')).toBe(true)

      // Should NOT match parent routes
      expect(headerRegex.test('/foo')).toBe(false)
      expect(headerRegex.test('/en/foo')).toBe(false)
    })
  })

  describe('catchall and optional catchall segments', () => {
    it('should handle interception from within a required catchall route', () => {
      // Blog pattern: /blog/[...category] can have many levels
      // User at /blog/tech/nextjs/latest intercepts /blog/post/123
      const rewrites = generateInterceptionRoutesRewrites([
        '/blog/[...category]/@modal/(.)post/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source is the intercepted route
      expect(rewrite.source).toBe('/blog/:nxtPcategory+/post/:nxtPid')

      // Destination includes the catchall from intercepting route
      expect(rewrite.destination).toBe(
        '/blog/:nxtPcategory+/@modal/(.)post/:nxtPid'
      )

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      // Source should match the target URL
      expect(sourceRegex.test('/blog/tech/post/123')).toBe(true)
      expect(sourceRegex.test('/blog/tech/nextjs/post/123')).toBe(true)
      expect(sourceRegex.test('/blog/tech/nextjs/latest/post/123')).toBe(true)

      // Header should match from the catchall route at any depth
      expect(headerRegex.test('/blog/tech')).toBe(true)
      expect(headerRegex.test('/blog/tech/nextjs')).toBe(true)
      expect(headerRegex.test('/blog/tech/nextjs/latest')).toBe(true)
      expect(headerRegex.test('/blog/tech/nextjs/latest/nested')).toBe(true)
    })

    it('should handle interception from optional catchall at deep nesting', () => {
      // i18n pattern: user at /en/US/dashboard intercepts /en/US/dashboard/settings
      const rewrites = generateInterceptionRoutesRewrites([
        '/[[...locale]]/dashboard/@modal/(.)settings',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      expect(rewrite.source).toBe('/:nxtPlocale*/dashboard/settings')
      expect(rewrite.destination).toBe(
        '/:nxtPlocale*/dashboard/@modal/(.)settings'
      )

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      // Source should match with various locale depths
      expect(sourceRegex.test('/dashboard/settings')).toBe(true)
      expect(sourceRegex.test('/en/dashboard/settings')).toBe(true)
      expect(sourceRegex.test('/en/US/dashboard/settings')).toBe(true)
      expect(sourceRegex.test('/en/US/CA/dashboard/settings')).toBe(true)

      // Header should match from dashboard at any locale depth
      expect(headerRegex.test('/dashboard')).toBe(true)
      expect(headerRegex.test('/en/dashboard')).toBe(true)
      expect(headerRegex.test('/en/US/dashboard')).toBe(true)
      expect(headerRegex.test('/en/US/CA/dashboard')).toBe(true)
      expect(headerRegex.test('/en/US/dashboard/nested')).toBe(true)
    })

    it('should handle (..) interception from within catchall with deep navigation', () => {
      // Docs site: user at /docs/api/reference/components navigates one level up
      const rewrites = generateInterceptionRoutesRewrites([
        '/docs/[...slug]/@modal/(..)related',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // (..) goes one level up from /docs/[...slug], which is /docs
      expect(rewrite.source).toBe('/docs/related')
      expect(rewrite.destination).toBe('/docs/:nxtPslug+/@modal/(..)related')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/docs/related')).toBe(true)

      // Header should match from any depth within the docs catchall
      expect(headerRegex.test('/docs/api')).toBe(true)
      expect(headerRegex.test('/docs/api/reference')).toBe(true)
      expect(headerRegex.test('/docs/api/reference/components')).toBe(true)
      expect(headerRegex.test('/docs/guide/getting-started/intro')).toBe(true)
    })

    it('should generate path-to-regexp format with + suffix for catchall parameters', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/templates/(..)showcase/[...catchAll]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // The key improvement: catchall parameters should get * suffix for path-to-regexp
      expect(rewrite.source).toBe('/showcase/:nxtPcatchAll+')
      expect(rewrite.destination).toBe('/templates/(..)showcase/:nxtPcatchAll+')

      // Test with multiple catchall parameters
      const multiCatchallRewrites = generateInterceptionRoutesRewrites([
        '/blog/[...category]/(..)archives/[...path]',
      ])

      expect(multiCatchallRewrites).toHaveLength(1)
      const multiRewrite = multiCatchallRewrites[0]

      // The source should only contain the intercepted route parameters (path)
      // The intercepting route parameters (category) are not part of the source
      expect(multiRewrite.source).toBe('/blog/archives/:nxtPpath+')
      expect(multiRewrite.destination).toBe(
        '/blog/:nxtPcategory+/(..)archives/:nxtPpath+'
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
      expect(rewrite.source).toBe('/shop/products/:nxtPid/reviews/:nxtPpath+')
      expect(rewrite.destination).toBe(
        '/shop/:nxtPcategory/(..)products/:nxtPid/reviews/:nxtPpath+'
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
        '/intercepting-routes-dynamic-catchall/photos/catchall/:nxtPid+'
      )

      // Destination should include the catchall parameter with * suffix
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic-catchall/photos/(.)catchall/:nxtPid+'
      )

      // Verify source regex matches catchall URLs
      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-routes\\-dynamic\\-catchall\\/photos(?:\\/.*)?$"`
      )

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

      // Should match the parent level and all descendants
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos')
      ).toBe(true)
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos/foo')
      ).toBe(true)
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos/foo/bar')
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-routes\\-dynamic\\-catchall\\/photos(?:\\/.*)?$"`
      )

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

      // Should match the parent level and all descendants
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos')
      ).toBe(true)
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos/foo')
      ).toBe(true)
      expect(
        headerRegex.test('/intercepting-routes-dynamic-catchall/photos/foo/bar')
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/intercepting\\-parallel\\-modal\\/(?<nxtPusername>[^/]+?)(?:\\/.*)?$"`
      )

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
      expect(headerRegex.source).toMatchInlineSnapshot(`"^\\/.*$"`)

      // Should match root-level routes and all descendants
      expect(headerRegex.test('/')).toBe(true)
      expect(headerRegex.test('/nested-link')).toBe(true)
      expect(headerRegex.test('/nested-link/deep')).toBe(true)
    })

    it('should handle parallel routes at nested levels', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/parallel-layout/(.)sub/[slug]',
      ])

      expect(rewrites).toHaveLength(1)

      // Note: Router adds ^ and $ anchors automatically via matchHas()
      const { headerRegex } = getRewriteMatchers(rewrites[0])
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/parallel\\-layout(?:\\/.*)?$"`
      )

      // Should match routes at /parallel-layout level and all descendants
      expect(headerRegex.test('/parallel-layout')).toBe(true)
      expect(headerRegex.test('/parallel-layout/nested')).toBe(true)
      expect(headerRegex.test('/parallel-layout/nested/deep')).toBe(true)
    })

    it('should handle optional catchall in route groups with (..) interception', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/(group)/[[...locale]]/dashboard/(..)settings',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Route groups should be normalized away from paths
      expect(rewrite.source).toBe('/:nxtPlocale*/settings')
      expect(rewrite.destination).toBe(
        '/(group)/:nxtPlocale*/dashboard/(..)settings'
      )

      const { headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?\\/dashboard(?:\\/.*)?$"`
      )

      // Route group should be normalized, so header should match without it
      expect(headerRegex.test('/dashboard')).toBe(true)
      expect(headerRegex.test('/en/dashboard')).toBe(true)
      expect(headerRegex.test('/en/us/dashboard')).toBe(true)
    })

    it('should handle optional catchall in parallel routes with (.) interception', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/@slot/[[...locale]]/(.)settings',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // @slot is a parallel route and should be normalized
      expect(rewrite.source).toBe('/:nxtPlocale*/settings')
      expect(rewrite.destination).toBe('/@slot/:nxtPlocale*/(.)settings')

      const { headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?(?:\\/.*)?$"`
      )

      // @slot should be normalized away, so interceptingRoute is root
      // With optional catchall at root level, should match all descendants
      expect(headerRegex.test('/')).toBe(true) // Zero locale segments (root level)
      expect(headerRegex.test('/en')).toBe(true) // One locale segment
      expect(headerRegex.test('/en/us')).toBe(true) // Multiple locale segments

      // Should match all descendants at any depth
      expect(headerRegex.test('/other-page')).toBe(true)
      expect(headerRegex.test('/en/settings')).toBe(true)
      expect(headerRegex.test('/en/us/nested')).toBe(true)
      expect(headerRegex.test('/en/settings/deep')).toBe(true)
      expect(headerRegex.test('/en/us/nested/deeper')).toBe(true)
      expect(headerRegex.test('/a/b/c/d/e')).toBe(true)
    })

    it('should handle parallel route with its own dynamic segment', () => {
      // Pattern: /@modal/[modalId] for different modal types
      const rewrites = generateInterceptionRoutesRewrites([
        '/@modal/[modalId]/(.)photos/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // @modal is normalized away, but [modalId] remains
      expect(rewrite.source).toBe('/:nxtPmodalId/photos/:nxtPid')
      expect(rewrite.destination).toBe('/@modal/:nxtPmodalId/(.)photos/:nxtPid')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      // Source should match with both parameters
      expect(sourceRegex.test('/gallery/photos/123')).toBe(true)
      expect(sourceRegex.test('/lightbox/photos/456')).toBe(true)

      // Header should match the modal type level
      expect(headerRegex.test('/gallery')).toBe(true)
      expect(headerRegex.test('/lightbox')).toBe(true)
      expect(headerRegex.test('/gallery/nested')).toBe(true)
    })

    it('should handle nested parallel route with dynamic segments in parent', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[org]/@sidebar/[section]/(..)profile',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // (..) goes one level up from /[org]/@sidebar/[section], which is /[org]
      expect(rewrite.source).toBe('/:nxtPorg/profile')
      expect(rewrite.destination).toBe(
        '/:nxtPorg/@sidebar/:nxtPsection/(..)profile'
      )

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

      expect(sourceRegex.test('/vercel/profile')).toBe(true)
      expect(sourceRegex.test('/acme/profile')).toBe(true)

      // Header should match the sidebar section level
      expect(headerRegex.test('/vercel/settings')).toBe(true)
      expect(headerRegex.test('/acme/dashboard')).toBe(true)
      expect(headerRegex.test('/vercel/settings/nested')).toBe(true)
    })

    it('should handle multiple parallel routes with their own dynamic segments', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/[workspace]/@sidebar/[section]/@modal/[modalType]/(.)content/[id]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Both parallel routes are normalized but their dynamic segments remain
      expect(rewrite.source).toBe(
        '/:nxtPworkspace/:nxtPsection/:nxtPmodalType/content/:nxtPid'
      )
      expect(rewrite.destination).toBe(
        '/:nxtPworkspace/@sidebar/:nxtPsection/@modal/:nxtPmodalType/(.)content/:nxtPid'
      )

      const { sourceRegex } = getRewriteMatchers(rewrite)

      // Should match with all dynamic parameters
      expect(sourceRegex.test('/acme/settings/gallery/content/photo123')).toBe(
        true
      )

      const match = sourceRegex.exec('/acme/settings/gallery/content/photo123')
      expect(match?.groups).toEqual({
        nxtPworkspace: 'acme',
        nxtPsection: 'settings',
        nxtPmodalType: 'gallery',
        nxtPid: 'photo123',
      })
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
      expect(headerRegex.source).toMatchInlineSnapshot(`"^\\/.*$"`)

      expect(sourceRegex.test('/base/nested')).toBe(true)
      expect(sourceRegex.test('/nested')).toBe(false) // Should NOT match without basePath

      // But Next-Url header check should NOT include basePath
      // (comment in code says "The Next-Url header does not contain the base path")

      // Should match root-level routes and all descendants (without basePath in the check)
      expect(headerRegex.test('/')).toBe(true)
      expect(headerRegex.test('/nested-link')).toBe(true)
      expect(headerRegex.test('/base')).toBe(true)
      expect(headerRegex.test('/nested-link/deep')).toBe(true)
    })

    it('should handle optional catchall with basePath', () => {
      const rewrites = generateInterceptionRoutesRewrites(
        ['/[[...locale]]/(.)settings'],
        '/base'
      )

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Source and destination should include basePath
      expect(rewrite.source).toBe('/base/:nxtPlocale*/settings')
      expect(rewrite.destination).toBe('/base/:nxtPlocale*/(.)settings')

      const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^(?:\\/(?<nxtPlocale>.+?))?(?:\\/.*)?$"`
      )

      // Source regex should include basePath
      expect(sourceRegex.test('/base/settings')).toBe(true)
      expect(sourceRegex.test('/base/en/settings')).toBe(true)
      expect(sourceRegex.test('/base/en/us/settings')).toBe(true)
      expect(sourceRegex.test('/settings')).toBe(false) // Without basePath

      // Header check should NOT include basePath
      // The optional catchall allows zero or more segments at root level, matching all descendants
      expect(headerRegex.test('/')).toBe(true) // Zero locale segments
      expect(headerRegex.test('/en')).toBe(true) // One locale segment
      expect(headerRegex.test('/en/us')).toBe(true) // Multiple locale segments
      expect(headerRegex.test('/en/us/deep')).toBe(true) // Deep nesting
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
      expect(headerRegex.source).toMatchInlineSnapshot(
        `"^\\/(?<nxtPthisismyroute>[^/]+?)(?:\\/.*)?$"`
      )

      // Should match routes at the parent level and all descendants
      expect(headerRegex.test('/foo')).toBe(true)
      expect(headerRegex.test('/foo/bar')).toBe(true)
      expect(headerRegex.test('/foo/bar/baz')).toBe(true)
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
      expect(sourceParams).toEqual(['nxtIauthor', 'nxtPid'])

      // Extract parameter names from destination
      const destParams = rewrite.destination
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(destParams).toEqual(['nxtIauthor', 'nxtPid'])

      // Extract capture group names from regex
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])
      expect(regexParams).toEqual(['nxtIauthor', 'nxtPid'])

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
        nxtIcategory: 'electronics',
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

      // Verify catchall parameters get + suffix in path-to-regexp format
      expect(rewrite.source).toBe('/docs/:nxtIslug+')
      expect(rewrite.destination).toBe('/docs/(.):nxtIslug+')

      const sourceParams = rewrite.source
        .match(/:(\w+)\*?/g)
        ?.map((p) => p.slice(1).replace('*', ''))
      const destParams = rewrite.destination
        .match(/:(\w+)\*?/g)
        ?.map((p) => p.slice(1).replace('*', ''))
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])

      expect(sourceParams).toEqual(['nxtIslug'])
      expect(destParams).toEqual(['nxtIslug'])
      expect(regexParams).toEqual(['nxtIslug'])

      // Test actual matching and substitution
      const { sourceRegex } = getRewriteMatchers(rewrite)
      const match = sourceRegex.exec('/docs/getting-started/installation')

      expect(match).toBeTruthy()
      expect(match!.groups!.nxtIslug).toBe('getting-started/installation')
    })

    it('should handle multiple parameters with mixed types consistently', () => {
      const rewrites = generateInterceptionRoutesRewrites([
        '/blog/[year]/[month]/(.)[slug]/comments/[...commentPath]',
      ])

      expect(rewrites).toHaveLength(1)
      const rewrite = rewrites[0]

      // Verify source and destination have correct format with + suffix for catchall
      expect(rewrite.source).toBe(
        '/blog/:nxtPyear/:nxtPmonth/:nxtIslug/comments/:nxtPcommentPath+'
      )
      expect(rewrite.destination).toBe(
        '/blog/:nxtPyear/:nxtPmonth/(.):nxtIslug/comments/:nxtPcommentPath+'
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
        'nxtIslug',
        'nxtPcommentPath',
      ])
      expect(destParams).toEqual([
        'nxtPyear',
        'nxtPmonth',
        'nxtIslug',
        'nxtPcommentPath',
      ])
      expect(regexParams).toEqual([
        'nxtPyear',
        'nxtPmonth',
        'nxtIslug',
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
        '/intercepting-routes-dynamic/photos/:nxtIauthor/:nxtPid'
      )
      expect(rewrite.destination).toBe(
        '/intercepting-routes-dynamic/photos/(.):nxtIauthor/:nxtPid'
      )

      // The bug was: regex had (?<nxtPauthor> but source had :nxtIauthor
      // Now they should match:
      const regexParams = Array.from(
        rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
      ).map((m) => m[1])
      expect(regexParams).toEqual(['nxtIauthor', 'nxtPid'])

      const sourceParams = rewrite.source
        .match(/:(\w+)/g)
        ?.map((p) => p.slice(1))
      expect(sourceParams).toEqual(['nxtIauthor', 'nxtPid'])

      // Verify actual URL matching and substitution works
      const { sourceRegex } = getRewriteMatchers(rewrite)
      const match = sourceRegex.exec(
        '/intercepting-routes-dynamic/photos/next/123'
      )

      expect(match).toBeTruthy()
      expect(match!.groups).toEqual({
        nxtIauthor: 'next',
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

  describe('additional edge cases', () => {
    describe('multiple parallel routes in sequence', () => {
      it('should handle multiple parallel routes @slot1/@slot2', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/@slot1/@slot2/(.)photos',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Both @slot1 and @slot2 should be normalized to /
        expect(rewrite.source).toBe('/photos')
        expect(rewrite.destination).toBe('/@slot1/@slot2/(.)photos')

        // Header should match root-level routes and all descendants (both slots normalized away)
        const { headerRegex } = getRewriteMatchers(rewrite)
        expect(headerRegex.source).toMatchInlineSnapshot(`"^\\/.*$"`)

        expect(headerRegex.test('/')).toBe(true)
        expect(headerRegex.test('/home')).toBe(true)
        expect(headerRegex.test('/home/nested')).toBe(true)
      })
    })

    describe('optional catchall siblings', () => {
      it('should detect optional catchall sibling [[...]] for (..) interception', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/templates/(..)showcase',
          '/templates/[[...slug]]', // Optional catchall sibling
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/showcase')
        expect(rewrite.destination).toBe('/templates/(..)showcase')

        const { headerRegex } = getRewriteMatchers(rewrite)
        expect(headerRegex.source).toMatchInlineSnapshot(
          `"^\\/templates(?:\\/.*)?$"`
        )

        // With optional catchall sibling, should match exact level AND nested paths
        expect(headerRegex.test('/templates')).toBe(true)
        expect(headerRegex.test('/templates/foo')).toBe(true)
        expect(headerRegex.test('/templates/foo/bar')).toBe(true)
      })

      it('should handle optional catchall at intercepting route level', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[[...locale]]/dashboard/(..)settings',
          '/[[...locale]]/dashboard/[...slug]', // Required catchall sibling
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/:nxtPlocale*/settings')
        expect(rewrite.destination).toBe('/:nxtPlocale*/dashboard/(..)settings')

        const { headerRegex } = getRewriteMatchers(rewrite)
        expect(headerRegex.source).toMatchInlineSnapshot(
          `"^(?:\\/(?<nxtPlocale>.+?))?\\/dashboard(?:\\/.*)?$"`
        )

        // Should match dashboard with and without locale, plus nested paths
        expect(headerRegex.test('/dashboard')).toBe(true)
        expect(headerRegex.test('/en/dashboard')).toBe(true)
        expect(headerRegex.test('/dashboard/foo')).toBe(true)
        expect(headerRegex.test('/en/dashboard/foo/bar')).toBe(true)
      })
    })

    describe('intercepting catchall routes', () => {
      it('should intercept a required catchall route with (.)', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/feed/(.)blog/[...slug]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Source should have catchall parameter with + suffix
        expect(rewrite.source).toBe('/feed/blog/:nxtPslug+')
        expect(rewrite.destination).toBe('/feed/(.)blog/:nxtPslug+')

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
        expect(headerRegex.source).toMatchInlineSnapshot(
          `"^\\/feed(?:\\/.*)?$"`
        )

        // Source should match catchall paths
        expect(sourceRegex.test('/feed/blog/post-1')).toBe(true)
        expect(sourceRegex.test('/feed/blog/2024/post-1')).toBe(true)
        expect(sourceRegex.test('/feed/blog/a/b/c')).toBe(true)

        // Header should match /feed level and all descendants
        expect(headerRegex.test('/feed')).toBe(true)
        expect(headerRegex.test('/feed/home')).toBe(true)
        expect(headerRegex.test('/feed/home/nested')).toBe(true)
      })

      it('should intercept an optional catchall route with (..)', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/dashboard/settings/(..)docs/[[...path]]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Optional catchall gets * suffix
        expect(rewrite.source).toBe('/dashboard/docs/:nxtPpath*')
        expect(rewrite.destination).toBe(
          '/dashboard/settings/(..)docs/:nxtPpath*'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
        expect(headerRegex.source).toMatchInlineSnapshot(
          `"^\\/dashboard\\/settings(?:\\/.*)?$"`
        )

        // Source should match with 0 or more path segments
        expect(sourceRegex.test('/dashboard/docs')).toBe(true)
        expect(sourceRegex.test('/dashboard/docs/intro')).toBe(true)
        expect(sourceRegex.test('/dashboard/docs/intro/getting-started')).toBe(
          true
        )

        // Header should match intercepting route level and all descendants
        expect(headerRegex.test('/dashboard/settings')).toBe(true)
        expect(headerRegex.test('/dashboard/settings/nested')).toBe(true)
      })

      it('should handle (...) intercepting a catchall at root', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/app/dashboard/@modal/(...)docs/[...path]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Source is at root with catchall
        expect(rewrite.source).toBe('/docs/:nxtPpath+')

        // Destination includes full path with @modal
        expect(rewrite.destination).toBe(
          '/app/dashboard/@modal/(...)docs/:nxtPpath+'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)
        expect(headerRegex.source).toMatchInlineSnapshot(
          `"^\\/app\\/dashboard(?:\\/.*)?$"`
        )

        // Source should match catchall paths
        expect(sourceRegex.test('/docs/getting-started')).toBe(true)
        expect(sourceRegex.test('/docs/api/reference')).toBe(true)

        // Header should match intercepting route level and all descendants
        expect(headerRegex.test('/app/dashboard')).toBe(true)
        expect(headerRegex.test('/app/dashboard/nested')).toBe(true)
        expect(headerRegex.test('/app/dashboard/nested/deep')).toBe(true)
      })
    })

    describe('static segment special characters', () => {
      it('should escape dots in static segments', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/api.v1/(.)endpoint.users',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/api.v1/endpoint.users')
        expect(rewrite.destination).toBe('/api.v1/(.)endpoint.users')

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Dots should be escaped in the regex
        expect(sourceRegex.test('/api.v1/endpoint.users')).toBe(true)
        expect(sourceRegex.test('/apixv1/endpointxusers')).toBe(false)

        // Header regex should also escape dots
        expect(headerRegex.test('/api.v1')).toBe(true)
        expect(headerRegex.test('/apixv1')).toBe(false)
      })

      it('should handle hyphens and underscores in static segments', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/my-route_name/(.)my-nested_path',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/my-route_name/my-nested_path')
        expect(rewrite.destination).toBe('/my-route_name/(.)my-nested_path')

        const { sourceRegex } = getRewriteMatchers(rewrite)

        // Hyphens and underscores should match literally
        expect(sourceRegex.test('/my-route_name/my-nested_path')).toBe(true)
        expect(sourceRegex.test('/myroutename/mynestedpath')).toBe(false)
      })
    })

    describe('basePath edge cases', () => {
      it('should handle basePath with special characters', () => {
        const rewrites = generateInterceptionRoutesRewrites(
          ['/@slot/(.)nested'],
          '/my-app.v1'
        )

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Source and destination should include basePath with special chars
        expect(rewrite.source).toBe('/my-app.v1/nested')
        expect(rewrite.destination).toBe('/my-app.v1/@slot/(.)nested')

        const { sourceRegex } = getRewriteMatchers(rewrite)

        // Should match with basePath
        expect(sourceRegex.test('/my-app.v1/nested')).toBe(true)
        expect(sourceRegex.test('/nested')).toBe(false)
        expect(sourceRegex.test('/my-appxv1/nested')).toBe(false)
      })

      it('should handle deeply nested basePath', () => {
        const rewrites = generateInterceptionRoutesRewrites(
          ['/dashboard/(.)settings'],
          '/app/v2/admin'
        )

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/app/v2/admin/dashboard/settings')
        expect(rewrite.destination).toBe('/app/v2/admin/dashboard/(.)settings')

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should include basePath
        expect(sourceRegex.test('/app/v2/admin/dashboard/settings')).toBe(true)
        expect(sourceRegex.test('/dashboard/settings')).toBe(false)

        // Header should NOT include basePath (per comment in code)
        expect(headerRegex.test('/dashboard')).toBe(true)
        expect(headerRegex.test('/dashboard/settings')).toBe(true)
      })

      it('should handle basePath with dynamic segments in path', () => {
        const rewrites = generateInterceptionRoutesRewrites(
          ['/[locale]/dashboard/(.)profile'],
          '/base'
        )

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/base/:nxtPlocale/dashboard/profile')
        expect(rewrite.destination).toBe(
          '/base/:nxtPlocale/dashboard/(.)profile'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should include basePath
        expect(sourceRegex.test('/base/en/dashboard/profile')).toBe(true)
        expect(sourceRegex.test('/en/dashboard/profile')).toBe(false)

        // Header should NOT include basePath but should have dynamic segment
        expect(headerRegex.test('/en/dashboard')).toBe(true)
        expect(headerRegex.test('/es/dashboard')).toBe(true)
      })
    })

    describe('parameter naming edge cases', () => {
      it('should handle same parameter names in intercepting and intercepted routes', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/posts/[id]/(.)comments/[id]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Both [id] parameters should get unique prefixed names
        expect(rewrite.source).toBe('/posts/:nxtPid/comments/:nxtPid')
        expect(rewrite.destination).toBe('/posts/:nxtPid/(.)comments/:nxtPid')

        // Verify the regex has consistent parameter names
        const regexParams = Array.from(
          rewrite.regex!.matchAll(/\(\?<(\w+)>/g)
        ).map((m) => m[1])

        // Should have both id parameters with consistent naming
        expect(regexParams).toContain('nxtPid')
      })

      it('should handle parameters with numbers and underscores', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[user_id123]/(.)[post_id456]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Underscores should be preserved in parameter names
        expect(rewrite.source).toBe('/:nxtPuser_id123/:nxtIpost_id456')
        expect(rewrite.destination).toBe('/:nxtPuser_id123/(.):nxtIpost_id456')

        const { sourceRegex } = getRewriteMatchers(rewrite)
        const match = sourceRegex.exec('/user123/post456')

        expect(match).toBeTruthy()
        expect(match!.groups).toEqual({
          nxtPuser_id123: 'user123',
          nxtIpost_id456: 'post456',
        })
      })

      it('should handle all-dynamic intercepting route path', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[org]/[repo]/[branch]/(.)file/[path]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe(
          '/:nxtPorg/:nxtPrepo/:nxtPbranch/file/:nxtPpath'
        )
        expect(rewrite.destination).toBe(
          '/:nxtPorg/:nxtPrepo/:nxtPbranch/(.)file/:nxtPpath'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should match all dynamic segments
        expect(sourceRegex.test('/vercel/next.js/canary/file/README.md')).toBe(
          true
        )

        // Header should match the intercepting route with all dynamic segments
        const match = headerRegex.exec('/vercel/next.js/canary')
        expect(match).toBeTruthy()
        expect(match![0]).toBe('/vercel/next.js/canary')
      })

      it('should handle consecutive dynamic segments', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[a]/[b]/[c]/[d]/(.)photos',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/:nxtPa/:nxtPb/:nxtPc/:nxtPd/photos')
        expect(rewrite.destination).toBe(
          '/:nxtPa/:nxtPb/:nxtPc/:nxtPd/(.)photos'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        expect(sourceRegex.test('/1/2/3/4/photos')).toBe(true)

        // Header should match four consecutive dynamic segments
        expect(headerRegex.test('/1/2/3/4')).toBe(true)
        expect(headerRegex.test('/a/b/c/d')).toBe(true)
      })
    })

    describe('mixed catchall types in same path', () => {
      it('should handle required and optional catchalls in same path', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[[...locale]]/docs/[...path]/(.)modal',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Optional catchall gets *, required gets +
        // The 'docs' static segment is part of the intercepting route path
        expect(rewrite.source).toBe('/:nxtPlocale*/docs/:nxtPpath+/modal')
        expect(rewrite.destination).toBe(
          '/:nxtPlocale*/docs/:nxtPpath+/(.)modal'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should match various combinations including 'docs' segment
        expect(sourceRegex.test('/modal')).toBe(false) // Need docs segment
        expect(sourceRegex.test('/docs/modal')).toBe(false) // path is required catchall (need at least one path segment)
        expect(sourceRegex.test('/docs/intro/modal')).toBe(true) // locale=empty, path=intro
        expect(sourceRegex.test('/en/docs/intro/modal')).toBe(true) // locale=en, path=intro

        // Header should handle optional catchall
        expect(headerRegex.test('/docs/intro')).toBe(true)
        expect(headerRegex.test('/en/docs/intro')).toBe(true)
      })

      it('should handle (..) with optional catchall intercepting required catchall', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[[...locale]]/dashboard/(..)blog/[...slug]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe('/:nxtPlocale*/blog/:nxtPslug+')
        expect(rewrite.destination).toBe(
          '/:nxtPlocale*/dashboard/(..)blog/:nxtPslug+'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should match with optional locale and required slug
        expect(sourceRegex.test('/blog/post-1')).toBe(true)
        expect(sourceRegex.test('/en/blog/post-1')).toBe(true)
        expect(sourceRegex.test('/en/us/blog/2024/post-1')).toBe(true)

        // Header should match dashboard with optional locale
        expect(headerRegex.test('/dashboard')).toBe(true)
        expect(headerRegex.test('/en/dashboard')).toBe(true)
        expect(headerRegex.test('/en/us/dashboard')).toBe(true)
      })
    })

    describe('deep nesting with many dynamic segments', () => {
      it('should handle GitHub-style deeply nested route with interception', () => {
        // Pattern: /[org]/[repo]/tree/[branch]/@modal intercepts blob one level up
        // (..) from /[org]/[repo]/tree/[branch] goes to /[org]/[repo]/tree
        const rewrites = generateInterceptionRoutesRewrites([
          '/[org]/[repo]/tree/[branch]/@modal/(..)blob/[...filepath]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // (..) goes one level up from /[org]/[repo]/tree/[branch], which is /[org]/[repo]/tree
        expect(rewrite.source).toBe(
          '/:nxtPorg/:nxtPrepo/tree/blob/:nxtPfilepath+'
        )

        // Destination includes all parameters from the intercepting route
        expect(rewrite.destination).toBe(
          '/:nxtPorg/:nxtPrepo/tree/:nxtPbranch/@modal/(..)blob/:nxtPfilepath+'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should match blob paths under tree
        expect(sourceRegex.test('/vercel/next.js/tree/blob/README.md')).toBe(
          true
        )
        expect(
          sourceRegex.test('/vercel/next.js/tree/blob/src/client/app.ts')
        ).toBe(true)

        // Header should match tree view at specific branch level
        expect(headerRegex.test('/vercel/next.js/tree/canary')).toBe(true)
        expect(headerRegex.test('/vercel/next.js/tree/main')).toBe(true)
        expect(headerRegex.test('/vercel/next.js/tree/canary/nested')).toBe(
          true
        )

        // Verify parameter extraction works correctly
        const match = sourceRegex.exec('/vercel/next.js/tree/blob/src/index.ts')
        expect(match?.groups).toEqual({
          nxtPorg: 'vercel',
          nxtPrepo: 'next.js',
          nxtPfilepath: 'src/index.ts',
        })
      })

      it('should handle multi-tenant SaaS with 5+ segments', () => {
        // Pattern: /[workspace]/[project]/[env]/[service]/settings intercepts logs
        const rewrites = generateInterceptionRoutesRewrites([
          '/[workspace]/[project]/[env]/[service]/settings/@modal/(.)logs/[...path]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe(
          '/:nxtPworkspace/:nxtPproject/:nxtPenv/:nxtPservice/settings/logs/:nxtPpath+'
        )
        expect(rewrite.destination).toBe(
          '/:nxtPworkspace/:nxtPproject/:nxtPenv/:nxtPservice/settings/@modal/(.)logs/:nxtPpath+'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Source should match deeply nested log paths
        expect(
          sourceRegex.test('/acme/website/prod/api/settings/logs/errors.log')
        ).toBe(true)
        expect(
          sourceRegex.test(
            '/acme/website/staging/web/settings/logs/2024/01/app.log'
          )
        ).toBe(true)

        // Header should match the settings level
        expect(headerRegex.test('/acme/website/prod/api/settings')).toBe(true)
        expect(headerRegex.test('/acme/website/staging/web/settings')).toBe(
          true
        )

        // Verify all parameters are extracted
        const match = sourceRegex.exec(
          '/acme/website/prod/api/settings/logs/error.log'
        )
        expect(match?.groups).toEqual({
          nxtPworkspace: 'acme',
          nxtPproject: 'website',
          nxtPenv: 'prod',
          nxtPservice: 'api',
          nxtPpath: 'error.log',
        })
      })

      it('should handle 6 consecutive dynamic segments with interception', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[a]/[b]/[c]/[d]/[e]/[f]/(.)target',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        expect(rewrite.source).toBe(
          '/:nxtPa/:nxtPb/:nxtPc/:nxtPd/:nxtPe/:nxtPf/target'
        )
        expect(rewrite.destination).toBe(
          '/:nxtPa/:nxtPb/:nxtPc/:nxtPd/:nxtPe/:nxtPf/(.)target'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        expect(sourceRegex.test('/1/2/3/4/5/6/target')).toBe(true)

        // Header should match all 6 levels
        expect(headerRegex.test('/1/2/3/4/5/6')).toBe(true)
        expect(headerRegex.test('/a/b/c/d/e/f')).toBe(true)

        // Verify all 6 parameters are captured
        const match = sourceRegex.exec('/1/2/3/4/5/6/target')
        expect(Object.keys(match?.groups || {}).length).toBe(6)
        expect(match?.groups).toMatchObject({
          nxtPa: '1',
          nxtPb: '2',
          nxtPc: '3',
          nxtPd: '4',
          nxtPe: '5',
          nxtPf: '6',
        })
      })
    })

    describe('multiple conflicting interception routes', () => {
      it('should handle multiple routes intercepting the same target from different levels', () => {
        // Real scenario: multiple modals at different levels trying to intercept the same route
        const rewrites = generateInterceptionRoutesRewrites([
          '/dashboard/@modal/(.)settings',
          '/dashboard/profile/@modal/(..)settings',
          '/@global-modal/(...)settings',
        ])

        // Should generate 3 rewrites, one for each interception route
        expect(rewrites).toHaveLength(3)

        // First rewrite: from /dashboard level
        const dashboardRewrite = rewrites[0]
        expect(dashboardRewrite.source).toBe('/dashboard/settings')
        expect(dashboardRewrite.destination).toBe(
          '/dashboard/@modal/(.)settings'
        )

        const { headerRegex: dashboardHeader } =
          getRewriteMatchers(dashboardRewrite)
        expect(dashboardHeader.test('/dashboard')).toBe(true)
        expect(dashboardHeader.test('/dashboard/profile')).toBe(true)

        // Second rewrite: from /dashboard/profile level (one level up)
        const profileRewrite = rewrites[1]
        expect(profileRewrite.source).toBe('/dashboard/settings')
        expect(profileRewrite.destination).toBe(
          '/dashboard/profile/@modal/(..)settings'
        )

        const { headerRegex: profileHeader } =
          getRewriteMatchers(profileRewrite)
        expect(profileHeader.test('/dashboard/profile')).toBe(true)
        expect(profileHeader.test('/dashboard/profile/nested')).toBe(true)

        // Third rewrite: from root level (...)
        const rootRewrite = rewrites[2]
        expect(rootRewrite.source).toBe('/settings')
        expect(rootRewrite.destination).toBe('/@global-modal/(...)settings')

        const { headerRegex: rootHeader } = getRewriteMatchers(rootRewrite)
        expect(rootHeader.test('/')).toBe(true)
        expect(rootHeader.test('/anything')).toBe(true)
      })

      it('should handle parallel routes with same target from different positions', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/dashboard/@sidebar/(.)user/[id]',
          '/dashboard/@modal/(.)user/[id]',
        ])

        expect(rewrites).toHaveLength(2)

        // Both should have the same source but different destinations
        expect(rewrites[0].source).toBe('/dashboard/user/:nxtPid')
        expect(rewrites[1].source).toBe('/dashboard/user/:nxtPid')

        expect(rewrites[0].destination).toBe(
          '/dashboard/@sidebar/(.)user/:nxtPid'
        )
        expect(rewrites[1].destination).toBe(
          '/dashboard/@modal/(.)user/:nxtPid'
        )

        // Both should match the same header pattern
        const { headerRegex: header1 } = getRewriteMatchers(rewrites[0])
        const { headerRegex: header2 } = getRewriteMatchers(rewrites[1])

        expect(header1.source).toBe(header2.source)
        expect(header1.test('/dashboard')).toBe(true)
      })
    })

    describe('complex real-world integration patterns', () => {
      it('should handle enterprise app with all features combined', () => {
        // i18n + multi-tenant + route groups + parallel routes + interception
        const rewrites = generateInterceptionRoutesRewrites([
          '/[[...locale]]/[workspace]/[project]/(dashboard)/[environment]/@modal/(..)settings/[section]/[...path]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // Source: intercepted route one level up from environment
        expect(rewrite.source).toBe(
          '/:nxtPlocale*/:nxtPworkspace/:nxtPproject/settings/:nxtPsection/:nxtPpath+'
        )

        // Destination: full path with all segments
        expect(rewrite.destination).toBe(
          '/:nxtPlocale*/:nxtPworkspace/:nxtPproject/(dashboard)/:nxtPenvironment/@modal/(..)settings/:nxtPsection/:nxtPpath+'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Test various locale depths with full path
        expect(sourceRegex.test('/acme/myapp/settings/general/advanced')).toBe(
          true
        )
        expect(
          sourceRegex.test('/en/acme/myapp/settings/general/advanced')
        ).toBe(true)
        expect(
          sourceRegex.test('/en/US/acme/myapp/settings/general/advanced/nested')
        ).toBe(true)

        // Header should match the environment level with optional locale
        expect(headerRegex.test('/acme/myapp/prod')).toBe(true)
        expect(headerRegex.test('/en/acme/myapp/staging')).toBe(true)
        expect(headerRegex.test('/en/US/acme/myapp/dev')).toBe(true)

        // Verify all parameters are captured correctly
        const match = sourceRegex.exec(
          '/en/acme/myapp/settings/billing/invoices/2024'
        )
        expect(match?.groups).toEqual({
          nxtPlocale: 'en',
          nxtPworkspace: 'acme',
          nxtPproject: 'myapp',
          nxtPsection: 'billing',
          nxtPpath: 'invoices/2024',
        })
      })

      it('should handle e-commerce with product categories and modals', () => {
        // (..) from /[[...locale]]/shop/[...category] goes to /[[...locale]]/shop
        const rewrites = generateInterceptionRoutesRewrites([
          '/[[...locale]]/shop/[...category]/@quickview/(..)product/[slug]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // (..) goes one level up from /[[...locale]]/shop/[...category], which is /[[...locale]]/shop
        expect(rewrite.source).toBe('/:nxtPlocale*/shop/product/:nxtPslug')
        expect(rewrite.destination).toBe(
          '/:nxtPlocale*/shop/:nxtPcategory+/@quickview/(..)product/:nxtPslug'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Should work with various locale depths
        expect(sourceRegex.test('/shop/product/laptop-1')).toBe(true)
        expect(sourceRegex.test('/en/shop/product/shirt-1')).toBe(true)
        expect(sourceRegex.test('/en/US/shop/product/blender-1')).toBe(true)

        // Header should match from category pages at any depth
        expect(headerRegex.test('/shop/electronics')).toBe(true)
        expect(headerRegex.test('/en/shop/clothing/mens')).toBe(true)
        expect(headerRegex.test('/en/US/shop/home/kitchen/appliances')).toBe(
          true
        )
      })

      it('should handle documentation site with versioning and modals', () => {
        // (..) from /[[...locale]]/docs/[version]/[...slug] goes to /[[...locale]]/docs/[version]
        const rewrites = generateInterceptionRoutesRewrites([
          '/[[...locale]]/docs/[version]/[...slug]/@modal/(..)api/[endpoint]',
        ])

        expect(rewrites).toHaveLength(1)
        const rewrite = rewrites[0]

        // (..) goes one level up from /[[...locale]]/docs/[version]/[...slug], which is /[[...locale]]/docs/[version]
        expect(rewrite.source).toBe(
          '/:nxtPlocale*/docs/:nxtPversion/api/:nxtPendpoint'
        )
        expect(rewrite.destination).toBe(
          '/:nxtPlocale*/docs/:nxtPversion/:nxtPslug+/@modal/(..)api/:nxtPendpoint'
        )

        const { sourceRegex, headerRegex } = getRewriteMatchers(rewrite)

        // Should handle different locales and versions
        expect(sourceRegex.test('/docs/v14/api/getStaticProps')).toBe(true)
        expect(sourceRegex.test('/en/docs/v15/api/generateStaticParams')).toBe(
          true
        )

        // Header should match the doc page level (with slug catchall)
        expect(headerRegex.test('/docs/v14/getting-started')).toBe(true)
        expect(headerRegex.test('/en/docs/v15/guides/routing')).toBe(true)

        const match = sourceRegex.exec('/en/docs/v15/api/generateStaticParams')
        expect(match?.groups).toEqual({
          nxtPlocale: 'en',
          nxtPversion: 'v15',
          nxtPendpoint: 'generateStaticParams',
        })
      })

      it('should handle social media app with multiple modal types', () => {
        const rewrites = generateInterceptionRoutesRewrites([
          '/[username]/@post-modal/[postId]/@comments/(..)comment/[commentId]',
          '/[username]/@photo-modal/(.)photos/[photoId]',
        ])

        expect(rewrites).toHaveLength(2)

        // First rewrite: comment modal from within post modal
        // (..) from /[username]/[postId] (after normalizing @post-modal/@comments) goes to /[username]
        const commentRewrite = rewrites[0]
        expect(commentRewrite.source).toBe(
          '/:nxtPusername/comment/:nxtPcommentId'
        )
        expect(commentRewrite.destination).toBe(
          '/:nxtPusername/@post-modal/:nxtPpostId/@comments/(..)comment/:nxtPcommentId'
        )

        // Second rewrite: photo modal from profile
        const photoRewrite = rewrites[1]
        expect(photoRewrite.source).toBe('/:nxtPusername/photos/:nxtPphotoId')
        expect(photoRewrite.destination).toBe(
          '/:nxtPusername/@photo-modal/(.)photos/:nxtPphotoId'
        )

        const { sourceRegex: commentSource, headerRegex: commentHeader } =
          getRewriteMatchers(commentRewrite)
        const { sourceRegex: photoSource, headerRegex: photoHeader } =
          getRewriteMatchers(photoRewrite)

        // Comment interception - goes one level up from postId, so no postId in source
        expect(commentSource.test('/john/comment/comment456')).toBe(true)
        expect(commentHeader.test('/john/post123')).toBe(true)

        // Photo interception
        expect(photoSource.test('/john/photos/photo789')).toBe(true)
        expect(photoHeader.test('/john')).toBe(true)
      })
    })
  })
})
