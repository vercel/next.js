import { validateAppPaths } from './validate-app-paths'

describe('validateAppPaths', () => {
  // NOTE: The paths passed to validateAppPaths have already been normalized
  // by normalizeAppPath, which strips out parallel route segments (@modal, etc.),
  // route groups ((group)), and the trailing /page or /route segment.
  //
  // So app/blog/@modal/[slug]/page.tsx becomes /blog/[slug]
  // and app/blog/[slug]/page.tsx also becomes /blog/[slug]

  describe('should allow valid route configurations', () => {
    it('allows routes with different static segments', () => {
      const paths = ['/blog/posts', '/blog/authors', '/about']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with different depths', () => {
      const paths = ['/blog', '/blog/[slug]', '/blog/[slug]/comments']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with different dynamic segment positions', () => {
      const paths = ['/[category]/posts', '/posts/[slug]', '/posts/featured']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with different catch-all patterns', () => {
      const paths = ['/docs/[...slug]', '/blog/[slug]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows special routes', () => {
      const paths = ['/_not-found', '/_global-error', '/blog/[slug]', '/about']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows same dynamic segment names in different paths', () => {
      const paths = ['/blog/[slug]', '/posts/[slug]', '/docs/[slug]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows routes with optional catch-all', () => {
      const paths = ['/docs/[[...slug]]', '/blog/[slug]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows catch-all at the end of path', () => {
      const paths = ['/docs/[...slug]', '/blog/posts/[...rest]']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows same parameter name in intercepting and intercepted routes', () => {
      // Interception routes should validate the intercepting and intercepted parts separately
      // /[locale]/example is the intercepting route
      // /[locale]/intercepted is the intercepted route
      const paths = ['/[locale]/example/(...)[locale]/intercepted']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('allows interception routes with different parameter names', () => {
      const paths = ['/blog/example/(...)[slug]/post']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })
  })

  describe('interception route validation', () => {
    it('detects duplicate slug names in intercepting part', () => {
      const paths = ['/[locale]/[locale]/example/(...)intercepted']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"You cannot have the same slug name "locale" repeat within a single dynamic path in route "/[locale]/[locale]/example/"."`
      )
    })

    it('detects duplicate slug names in intercepted part', () => {
      const paths = ['/blog/example/(...)[slug]/post/[slug]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"You cannot have the same slug name "slug" repeat within a single dynamic path in route "[slug]/post/[slug]"."`
      )
    })

    it('detects catch-all not at end in intercepting part', () => {
      const paths = ['/[...slug]/extra/(...)intercepted']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"Catch-all must be the last part of the URL in route "/[...slug]/extra/"."`
      )
    })

    it('detects catch-all not at end in intercepted part', () => {
      const paths = ['/intercepting/(...)[...slug]/extra']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"Catch-all must be the last part of the URL in route "[...slug]/extra"."`
      )
    })

    it('detects syntax error in intercepted part', () => {
      const paths = ['/blog/(...)[.slug]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"Segment names may not start with erroneous periods ('.slug') in route "[.slug]"."`
      )
    })

    it('detects syntax error in intercepting part', () => {
      const paths = ['/blog/[.invalid]/(...)intercepted']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"Segment names may not start with erroneous periods ('.invalid') in route "/blog/[.invalid]/"."`
      )
    })

    it('does not error when routes differ only by interception markers', () => {
      expect(() =>
        validateAppPaths(['/blog/test', '/blog/(..)test'])
      ).not.toThrow()
      expect(() =>
        validateAppPaths(['/blog/[slug]', '/blog/(..)[slug]'])
      ).not.toThrow()
    })
  })

  describe('should detect ambiguous routes', () => {
    it('detects conflict from normalized parallel routes (most common case)', () => {
      // This represents:
      // - app/blog/[slug]/page.tsx
      // - app/blog/@modal/[modalSlug]/page.tsx (normalized to /blog/[modalSlug])
      const paths = ['/blog/[slug]', '/blog/[modalSlug]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[slug]
         - /blog/[modalSlug]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict between three normalized parallel routes', () => {
      // This represents multiple parallel slots with dynamic segments
      const paths = ['/dashboard/[id]', '/dashboard/[userId]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/dashboard/[*]" matches multiple routes:
         - /dashboard/[id]
         - /dashboard/[userId]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict with different dynamic segment names', () => {
      const paths = ['/blog/[slug]', '/blog/[id]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[slug]
         - /blog/[id]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict with catch-all segments', () => {
      const paths = ['/docs/[...slug]', '/docs/[...pages]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/docs/[...*]" matches multiple routes:
         - /docs/[...slug]
         - /docs/[...pages]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict with optional catch-all segments', () => {
      const paths = ['/docs/[[...slug]]', '/docs/[[...pages]]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/docs/[[...*]]" matches multiple routes:
         - /docs/[[...slug]]
         - /docs/[[...pages]]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects multiple conflicts', () => {
      const paths = [
        '/blog/[slug]',
        '/blog/[id]',
        '/posts/[id]',
        '/posts/[slug]',
      ]

      // Should report both conflicts
      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[slug]
         - /blog/[id]

       Ambiguous route pattern "/posts/[*]" matches multiple routes:
         - /posts/[id]
         - /posts/[slug]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict with three or more routes', () => {
      // Three different routes that all normalize to the same pattern
      const paths = ['/blog/[slug]', '/blog/[id]', '/blog/[postId]']

      // All three should be listed
      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[slug]
         - /blog/[id]
         - /blog/[postId]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict between routes differing only by case', () => {
      // Different paths with case-different parameter names
      const paths = ['/blog/[Slug]', '/blog/[slug]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[Slug]
         - /blog/[slug]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('detects conflict between routes with underscores vs hyphens', () => {
      // These should be considered ambiguous even though underscore is a word character
      const paths = ['/blog/[hello_world]', '/blog/[hello-world]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[hello_world]
         - /blog/[hello-world]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })
  })

  describe('individual path validation', () => {
    describe('segment syntax errors', () => {
      it('detects three-dot character (…) instead of ...', () => {
        const paths = ['/docs/[…slug]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Detected a three-dot character ('…') in parameter "…slug" in route "/docs/[…slug]". Did you mean ('...')?"`
        )
      })

      it('detects extra brackets in segment names', () => {
        const paths = ['/blog/[[slug]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Segment names may not start or end with extra brackets ('[slug') in route "/blog/[[slug]"."`
        )
      })

      it('detects erroneous periods at start of segment', () => {
        const paths = ['/blog/[.slug]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Segment names may not start with erroneous periods ('.slug') in route "/blog/[.slug]"."`
        )
      })

      it('detects optional non-catch-all segments', () => {
        const paths = ['/blog/[[slug]]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Optional route parameters are not yet supported ("[[slug]]") in route "/blog/[[slug]]"."`
        )
      })

      it('detects empty parameter name in dynamic segment', () => {
        const paths = ['/blog/[]']

        expect(() => validateAppPaths(paths)).toThrow(/empty/i)
      })

      it('detects empty parameter name in catch-all segment', () => {
        const paths = ['/docs/[...]']

        expect(() => validateAppPaths(paths)).toThrow(/empty/i)
      })

      it('detects empty parameter name in optional catch-all segment', () => {
        const paths = ['/docs/[[...]]]']

        // Note: This malformed syntax triggers the "extra brackets" error first
        expect(() => validateAppPaths(paths)).toThrow(/extra brackets|empty/i)
      })

      it('detects extra closing bracket only', () => {
        const paths = ['/blog/[slug]]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Segment names may not start or end with extra brackets ('slug]') in route "/blog/[slug]]"."`
        )
      })

      it('detects two periods instead of three', () => {
        const paths = ['/blog/[..slug]']

        expect(() => validateAppPaths(paths)).toThrow(
          /segment names may not start with erroneous periods/i
        )
      })

      it('detects four periods in segment', () => {
        const paths = ['/blog/[....slug]']

        expect(() => validateAppPaths(paths)).toThrow(
          /segment names may not start with erroneous periods/i
        )
      })

      it('detects only periods in segment', () => {
        const paths = ['/blog/[....]]']

        expect(() => validateAppPaths(paths)).toThrow()
      })
    })

    describe('duplicate slug names', () => {
      it('detects duplicate slug names in same path', () => {
        const paths = ['/blog/[slug]/posts/[slug]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"You cannot have the same slug name "slug" repeat within a single dynamic path in route "/blog/[slug]/posts/[slug]"."`
        )
      })

      it('detects slug names differing only by non-word symbols', () => {
        const paths = ['/blog/[helloworld]/[hello-world]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"You cannot have the slug names "helloworld" and "hello-world" differ only by non-word symbols within a single dynamic path in route "/blog/[helloworld]/[hello-world]"."`
        )
      })
    })

    describe('catch-all placement', () => {
      it('detects catch-all not at the end', () => {
        const paths = ['/docs/[...slug]/more']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Catch-all must be the last part of the URL in route "/docs/[...slug]/more"."`
        )
      })

      it('detects optional catch-all not at the end', () => {
        const paths = ['/docs/[[...slug]]/more']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"Optional catch-all must be the last part of the URL in route "/docs/[[...slug]]/more"."`
        )
      })

      it('detects both required and optional catch-all in same path', () => {
        // This would be impossible in practice but we should catch it
        const paths = ['/docs/[...required]/[[...optional]]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"You cannot use both a required and optional catch-all route at the same level in route "/docs/[...required]/[[...optional]]"."`
        )
      })
    })

    describe('optional catch-all specificity conflicts', () => {
      it('detects route with same specificity as optional catch-all', () => {
        const paths = ['/docs', '/docs/[[...slug]]']

        expect(() =>
          validateAppPaths(paths)
        ).toThrowErrorMatchingInlineSnapshot(
          `"You cannot define a route with the same specificity as an optional catch-all route ("/docs" and "/docs/[[...slug]]")."`
        )
      })

      it('allows optional catch-all without conflicting route', () => {
        const paths = ['/docs/[[...slug]]']

        expect(() => validateAppPaths(paths)).not.toThrow()
      })

      it('allows nested optional catch-all without conflict', () => {
        const paths = ['/docs/api/[[...slug]]', '/docs/guides']

        expect(() => validateAppPaths(paths)).not.toThrow()
      })
    })
  })

  describe('edge cases', () => {
    it('handles empty array', () => {
      expect(() => validateAppPaths([])).not.toThrow()
    })

    it('handles single route', () => {
      expect(() => validateAppPaths(['/blog/[slug]'])).not.toThrow()
    })

    it('handles complex nested structures', () => {
      const paths = [
        '/[locale]/blog/[category]/[slug]',
        '/[locale]/blog/[category]/featured',
      ]

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    it('handles root route', () => {
      const paths = ['/', '/blog']

      expect(() => validateAppPaths(paths)).not.toThrow()
    })

    // Test for optional catch-all at root level
    it('detects conflict between root route and root-level optional catch-all', () => {
      const paths = ['/', '/[[...slug]]']

      expect(() => validateAppPaths(paths)).toThrow(
        /same specificity as an optional catch-all/
      )
    })

    // Test for optional catch-all with dynamic segments in prefix
    it('detects conflict when optional catch-all prefix has dynamic segment with different param name', () => {
      // /blog/[category]/[[...slug]] with zero slug segments = /blog/[category]
      // /blog/[cat] is structurally identical to /blog/[category]
      const paths = ['/blog/[category]/[[...slug]]', '/blog/[cat]']

      expect(() => validateAppPaths(paths)).toThrow(
        /same specificity as an optional catch-all/
      )
    })

    // Test for optional catch-all with nested dynamic segments
    it('detects conflict with multiple dynamic segments in prefix', () => {
      // /[locale]/blog/[category]/[[...slug]] with zero slug = /[locale]/blog/[category]
      // /[lang]/blog/[cat] is structurally identical
      const paths = [
        '/[locale]/blog/[category]/[[...slug]]',
        '/[lang]/blog/[cat]',
      ]

      expect(() => validateAppPaths(paths)).toThrow(
        /same specificity as an optional catch-all/
      )
    })
  })

  describe('error message quality', () => {
    it('provides clear error message with normalized path', () => {
      const paths = ['/blog/[slug]', '/blog/[modalSlug]']

      expect(() => validateAppPaths(paths)).toThrow(
        /Ambiguous route pattern "\/blog\/\[\*\]"/
      )
    })

    it('provides actionable guidance', () => {
      const paths = ['/blog/[slug]', '/blog/[id]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[slug]
         - /blog/[id]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('lists all conflicting routes', () => {
      const paths = ['/blog/[slug]', '/blog/[id]', '/blog/[postId]']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(`
       "Ambiguous app routes detected:

       Ambiguous route pattern "/blog/[*]" matches multiple routes:
         - /blog/[slug]
         - /blog/[id]
         - /blog/[postId]

       These routes cannot be distinguished from each other when matching URLs. Please ensure that dynamic segments have unique patterns or use different static segments."
      `)
    })

    it('provides clear message for syntax errors', () => {
      const paths = ['/docs/[...slug]/more']

      expect(() => validateAppPaths(paths)).toThrowErrorMatchingInlineSnapshot(
        `"Catch-all must be the last part of the URL in route "/docs/[...slug]/more"."`
      )
    })
  })
})
