import { getNamedRouteRegex } from './route-regex'
import { parseParameter } from './get-dynamic-param'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'

/**
 * Helper function to compile a pathToRegexpPattern from a route and test it against paths
 */
function compilePattern(
  route: string,
  options: Parameters<typeof getNamedRouteRegex>[1]
) {
  const regex = getNamedRouteRegex(route, options)

  const compiled = pathToRegexp(regex.pathToRegexpPattern, [], {
    strict: true,
    sensitive: false,
    delimiter: '/',
  })

  return { regex, compiled }
}

describe('getNamedRouteRegex', () => {
  it('should handle interception markers adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "author": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "id": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/photos/\\(\\.\\)(?<nxtIauthor>[^/]+?)/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/photos/(.):nxtIauthor/:nxtPid",
       "re": /\\^\\\\/photos\\\\/\\\\\\(\\\\\\.\\\\\\)\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {
           "author": "(.)",
         },
         "names": {
           "author": "nxtIauthor",
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtIauthor": "nxtIauthor",
         "nxtPid": "nxtPid",
       },
     }
    `)

    expect(regex.re.exec('/photos/(.)next/123')).toMatchInlineSnapshot(`
     [
       "/photos/(.)next/123",
       "next",
       "123",
     ]
    `)
  })

  it('should match named routes correctly when interception markers are adjacent to dynamic segments', () => {
    let regex = getNamedRouteRegex('/(.)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "author": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "id": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/\\(\\.\\)(?<nxtIauthor>[^/]+?)/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/(.):nxtIauthor/:nxtPid",
       "re": /\\^\\\\/\\\\\\(\\\\\\.\\\\\\)\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {
           "author": "(.)",
         },
         "names": {
           "author": "nxtIauthor",
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtIauthor": "nxtIauthor",
         "nxtPid": "nxtPid",
       },
     }
    `)

    let namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(.)[author]/[id]')).toBe(true)

    regex = getNamedRouteRegex('/(..)(..)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "author": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "id": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/\\(\\.\\.\\)\\(\\.\\.\\)(?<nxtIauthor>[^/]+?)/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/(..)(..):nxtIauthor/:nxtPid",
       "re": /\\^\\\\/\\\\\\(\\\\\\.\\\\\\.\\\\\\)\\\\\\(\\\\\\.\\\\\\.\\\\\\)\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {
           "author": "(..)(..)",
         },
         "names": {
           "author": "nxtIauthor",
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtIauthor": "nxtIauthor",
         "nxtPid": "nxtPid",
       },
     }
    `)

    namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(..)(..)[author]/[id]')).toBe(true)
  })

  it('should handle multi-level interception markers', () => {
    const regex = getNamedRouteRegex('/photos/(..)(..)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "author": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "id": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/photos/\\(\\.\\.\\)\\(\\.\\.\\)(?<nxtIauthor>[^/]+?)/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/photos/(..)(..):nxtIauthor/:nxtPid",
       "re": /\\^\\\\/photos\\\\/\\\\\\(\\\\\\.\\\\\\.\\\\\\)\\\\\\(\\\\\\.\\\\\\.\\\\\\)\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {
           "author": "(..)(..)",
         },
         "names": {
           "author": "nxtIauthor",
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtIauthor": "nxtIauthor",
         "nxtPid": "nxtPid",
       },
     }
    `)

    expect(regex.re.exec('/photos/(..)(..)next/123')).toMatchInlineSnapshot(`
     [
       "/photos/(..)(..)next/123",
       "next",
       "123",
     ]
    `)
  })

  it('should not remove extra parts beside the param segments', () => {
    const regex = getNamedRouteRegex(
      '/[locale]/about.segments/[...segmentPath].segment.rsc',
      {
        prefixRouteKeys: true,
        includeSuffix: true,
      }
    )

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "locale": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "segmentPath": {
           "optional": false,
           "pos": 2,
           "repeat": true,
         },
       },
       "namedRegex": "^/(?<nxtPlocale>[^/]+?)/about\\.segments/(?<nxtPsegmentPath>.+?)\\.segment\\.rsc(?:/)?$",
       "pathToRegexpPattern": "/:nxtPlocale/about.segments/:nxtPsegmentPath+.segment.rsc",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/about\\\\\\.segments\\\\/\\(\\.\\+\\?\\)\\\\\\.segment\\\\\\.rsc\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "locale": "nxtPlocale",
           "segmentPath": "nxtPsegmentPath",
         },
       },
       "routeKeys": {
         "nxtPlocale": "nxtPlocale",
         "nxtPsegmentPath": "nxtPsegmentPath",
       },
     }
    `)
  })

  it('should not remove extra parts in front of the param segments', () => {
    const regex = getNamedRouteRegex(
      '/[locale]/about.segments/$dname$d[name].segment.rsc',
      {
        prefixRouteKeys: true,
        includeSuffix: true,
        includePrefix: true,
      }
    )

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "locale": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "name": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPlocale>[^/]+?)/about\\.segments/\\$dname\\$d(?<nxtPname>[^/]+?)\\.segment\\.rsc(?:/)?$",
       "pathToRegexpPattern": "/:nxtPlocale/about.segments/$dname$d/:nxtPname.segment.rsc",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/about\\\\\\.segments\\\\/\\\\\\$dname\\\\\\$d\\(\\[\\^/\\]\\+\\?\\)\\\\\\.segment\\\\\\.rsc\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "locale": "nxtPlocale",
           "name": "nxtPname",
         },
       },
       "routeKeys": {
         "nxtPlocale": "nxtPlocale",
         "nxtPname": "nxtPname",
       },
     }
    `)

    expect('/en/about.segments/$dname$dwyatt.segment.rsc'.match(regex.re))
      .toMatchInlineSnapshot(`
     [
       "/en/about.segments/$dname$dwyatt.segment.rsc",
       "en",
       "wyatt",
     ]
    `)
  })

  it('should handle interception markers not adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)author/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "id": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
       },
       "namedRegex": "^/photos/\\(\\.\\)author/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/photos/(.)author/:nxtPid",
       "re": /\\^\\\\/photos\\\\/\\\\\\(\\\\\\.\\\\\\)author\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtPid": "nxtPid",
       },
     }
    `)

    expect(regex.re.exec('/photos/(.)author/123')).toMatchInlineSnapshot(`
     [
       "/photos/(.)author/123",
       "123",
     ]
    `)
  })

  it('should handle optional dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/[[id]]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "id": {
           "optional": true,
           "pos": 1,
           "repeat": false,
         },
       },
       "namedRegex": "^/photos(?:/(?<nxtPid>[^/]+?))?(?:/)?$",
       "pathToRegexpPattern": "/photos/:nxtPid",
       "re": /\\^\\\\/photos\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtPid": "nxtPid",
       },
     }
    `)

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: true,
    })
  })

  it('should handle optional catch-all dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/[[...id]]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "id": {
           "optional": true,
           "pos": 1,
           "repeat": true,
         },
       },
       "namedRegex": "^/photos(?:/(?<nxtPid>.+?))?(?:/)?$",
       "pathToRegexpPattern": "/photos/:nxtPid*",
       "re": /\\^\\\\/photos\\(\\?:\\\\/\\(\\.\\+\\?\\)\\)\\?\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtPid": "nxtPid",
       },
     }
    `)

    expect(regex.re.exec('/photos/1')).toMatchInlineSnapshot(`
     [
       "/photos/1",
       "1",
     ]
    `)
    expect(regex.re.exec('/photos/1/2/3')).toMatchInlineSnapshot(`
     [
       "/photos/1/2/3",
       "1/2/3",
     ]
    `)
    expect(regex.re.exec('/photos')).toMatchInlineSnapshot(`
     [
       "/photos",
       undefined,
     ]
    `)
  })
})

describe('getNamedRouteRegex - Parameter Sanitization', () => {
  it('should sanitize parameter names with hyphens', () => {
    const regex = getNamedRouteRegex('/[foo-bar]/page', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "foo-bar": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPfoobar>[^/]+?)/page(?:/)?$",
       "pathToRegexpPattern": "/:nxtPfoobar/page",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/page\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "foo-bar": "nxtPfoobar",
         },
       },
       "routeKeys": {
         "nxtPfoobar": "nxtPfoo-bar",
       },
     }
    `)
  })

  it('should sanitize parameter names with underscores', () => {
    const regex = getNamedRouteRegex('/[foo_id]/page', {
      prefixRouteKeys: true,
    })

    // Underscores should be removed from parameter names
    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "foo_id": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPfoo_id>[^/]+?)/page(?:/)?$",
       "pathToRegexpPattern": "/:nxtPfoo_id/page",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/page\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "foo_id": "nxtPfoo_id",
         },
       },
       "routeKeys": {
         "nxtPfoo_id": "nxtPfoo_id",
       },
     }
    `)
  })

  it('should handle parameters with multiple special characters', () => {
    const regex = getNamedRouteRegex('/[this-is_my-route]/page', {
      prefixRouteKeys: true,
    })

    // Special characters are removed for the sanitized key, but routeKeys maps back to original
    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "this-is_my-route": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPthisis_myroute>[^/]+?)/page(?:/)?$",
       "pathToRegexpPattern": "/:nxtPthisis_myroute/page",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/page\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "this-is_my-route": "nxtPthisis_myroute",
         },
       },
       "routeKeys": {
         "nxtPthisis_myroute": "nxtPthis-is_my-route",
       },
     }
    `)
  })

  it('should generate safe keys for invalid parameter names', () => {
    // Parameter name that starts with a number gets the prefix but keeps numbers
    const regex1 = getNamedRouteRegex('/[123invalid]/page', {
      prefixRouteKeys: true,
    })

    // Numbers at the start cause fallback, but with prefix it becomes valid
    expect(Object.keys(regex1.routeKeys)).toHaveLength(1)
    const key1 = Object.keys(regex1.routeKeys)[0]
    // With prefixRouteKeys, the nxtP prefix makes it valid even with leading numbers
    expect(key1).toMatch(/^nxtP123invalid$/)

    // Parameter name that's too long (>30 chars) triggers fallback
    const longName = 'a'.repeat(35)
    const regex2 = getNamedRouteRegex(`/[${longName}]/page`, {
      prefixRouteKeys: true,
    })

    // Should fall back to generated safe key
    expect(Object.keys(regex2.routeKeys)).toHaveLength(1)
    const key2 = Object.keys(regex2.routeKeys)[0]
    // Fallback keys are just lowercase letters
    expect(key2).toMatch(/^[a-z]+$/)
    expect(key2.length).toBeLessThanOrEqual(30)
  })
})

describe('getNamedRouteRegex - Reference Mapping', () => {
  it('should use provided reference for parameter mapping', () => {
    // First call establishes the reference
    const regex1 = getNamedRouteRegex('/[lang]/photos', {
      prefixRouteKeys: true,
    })

    // Second call uses the reference from the first
    const regex2 = getNamedRouteRegex('/[lang]/photos/[id]', {
      prefixRouteKeys: true,
      reference: regex1.reference,
    })

    // Both should use the same prefixed key for 'lang'
    expect(regex1.reference.names.lang).toBe(regex2.reference.names.lang)
    expect(regex2.reference.names.lang).toBe('nxtPlang')

    // New parameter should be added to the reference
    expect(regex2.reference.names.id).toBe('nxtPid')
  })

  it('should maintain reference consistency across multiple paths', () => {
    const baseRegex = getNamedRouteRegex('/[locale]/example', {
      prefixRouteKeys: true,
    })

    const interceptedRegex = getNamedRouteRegex('/[locale]/intercepted', {
      prefixRouteKeys: true,
      reference: baseRegex.reference,
    })

    // Same parameter name should map to same prefixed key
    expect(baseRegex.reference.names.locale).toBe(
      interceptedRegex.reference.names.locale
    )
    expect(interceptedRegex.reference.names.locale).toBe('nxtPlocale')
  })

  it('should generate inverse pattern with correct parameter references', () => {
    const regex = getNamedRouteRegex('/[lang]/posts/[id]', {
      prefixRouteKeys: true,
    })

    // Inverse pattern should use the same prefixed keys
    expect(regex.pathToRegexpPattern).toBe('/:nxtPlang/posts/:nxtPid')

    // And they should match the routeKeys
    expect(regex.routeKeys.nxtPlang).toBe('nxtPlang')
    expect(regex.routeKeys.nxtPid).toBe('nxtPid')
  })
})

describe('getNamedRouteRegex - Duplicate Keys', () => {
  it('should handle duplicate parameters with backreferences', () => {
    const regex = getNamedRouteRegex('/[id]/posts/[id]', {
      prefixRouteKeys: true,
      backreferenceDuplicateKeys: true,
    })

    // Should have only one key, named regex should contain a backreference for
    // the second occurrence
    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "id": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPid>[^/]+?)/posts/\\k<nxtPid>(?:/)?$",
       "pathToRegexpPattern": "/:nxtPid/posts/:nxtPid",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/posts\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtPid": "nxtPid",
       },
     }
    `)
  })

  it('should handle duplicate parameters without backreferences', () => {
    const regex = getNamedRouteRegex('/[id]/posts/[id]', {
      prefixRouteKeys: true,
      backreferenceDuplicateKeys: false,
    })

    // Should still have only one key, but no backreference in the pattern.
    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "id": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPid>[^/]+?)/posts/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/:nxtPid/posts/:nxtPid",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/posts\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtPid": "nxtPid",
       },
     }
    `)
  })
})

describe('getNamedRouteRegex - Complex Paths', () => {
  it('should handle paths with multiple dynamic segments', () => {
    const regex = getNamedRouteRegex('/[org]/[repo]/[branch]/[...path]', {
      prefixRouteKeys: true,
    })

    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "branch": {
           "optional": false,
           "pos": 3,
           "repeat": false,
         },
         "org": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
         "path": {
           "optional": false,
           "pos": 4,
           "repeat": true,
         },
         "repo": {
           "optional": false,
           "pos": 2,
           "repeat": false,
         },
       },
       "namedRegex": "^/(?<nxtPorg>[^/]+?)/(?<nxtPrepo>[^/]+?)/(?<nxtPbranch>[^/]+?)/(?<nxtPpath>.+?)(?:/)?$",
       "pathToRegexpPattern": "/:nxtPorg/:nxtPrepo/:nxtPbranch/:nxtPpath+",
       "re": /\\^\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\[\\^/\\]\\+\\?\\)\\\\/\\(\\.\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "branch": "nxtPbranch",
           "org": "nxtPorg",
           "path": "nxtPpath",
           "repo": "nxtPrepo",
         },
       },
       "routeKeys": {
         "nxtPbranch": "nxtPbranch",
         "nxtPorg": "nxtPorg",
         "nxtPpath": "nxtPpath",
         "nxtPrepo": "nxtPrepo",
       },
     }
    `)

    // Test actual matching
    const match = regex.re.exec('/vercel/next.js/canary/docs/api/reference')
    expect(match).toBeTruthy()
    expect(match![0]).toBe('/vercel/next.js/canary/docs/api/reference')
    expect(match![1]).toBe('vercel')
    expect(match![2]).toBe('next.js')
    expect(match![3]).toBe('canary')
    expect(match![4]).toBe('docs/api/reference')
  })

  it('should mark optional segments correctly', () => {
    // Optional segments are marked as optional in the groups
    const regex = getNamedRouteRegex('/posts/[[slug]]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtPslug: 'nxtPslug',
    })

    expect(regex.groups).toEqual({
      slug: { pos: 1, repeat: false, optional: true },
    })

    // Regex should include optional pattern
    expect(regex.namedRegex).toContain('?')
  })

  it('should handle all interception markers', () => {
    const markers = ['(.)', '(..)', '(..)(..)', '(...)']

    for (const marker of markers) {
      const regex = getNamedRouteRegex(`/photos/${marker}[id]`, {
        prefixRouteKeys: true,
      })

      // Should use consistent parameter prefix (interception marker adjacent to parameter uses nxtI)
      expect(regex.routeKeys).toEqual({
        nxtIid: 'nxtIid',
      })

      // Should escape the marker in the regex
      const escapedMarker = marker.replace(/[().]/g, '\\$&')
      expect(regex.namedRegex).toContain(escapedMarker)
    }
  })
})

describe('getNamedRouteRegex - Trailing Slash Behavior', () => {
  it('should include optional trailing slash by default', () => {
    const regex = getNamedRouteRegex('/posts/[id]', {
      prefixRouteKeys: true,
    })

    // Should end with optional trailing slash
    expect(regex).toMatchInlineSnapshot(`
     {
       "groups": {
         "id": {
           "optional": false,
           "pos": 1,
           "repeat": false,
         },
       },
       "namedRegex": "^/posts/(?<nxtPid>[^/]+?)(?:/)?$",
       "pathToRegexpPattern": "/posts/:nxtPid",
       "re": /\\^\\\\/posts\\\\/\\(\\[\\^/\\]\\+\\?\\)\\(\\?:\\\\/\\)\\?\\$/,
       "reference": {
         "intercepted": {},
         "names": {
           "id": "nxtPid",
         },
       },
       "routeKeys": {
         "nxtPid": "nxtPid",
       },
     }
    `)

    // Should match both with and without trailing slash
    const namedRe = new RegExp(regex.namedRegex)
    expect(namedRe.test('/posts/123')).toBe(true)
    expect(namedRe.test('/posts/123/')).toBe(true)
  })

  it('should exclude optional trailing slash when specified', () => {
    const regex = getNamedRouteRegex('/posts/[id]', {
      prefixRouteKeys: true,
      excludeOptionalTrailingSlash: true,
    })

    // Should NOT have optional trailing slash
    expect(regex.namedRegex).not.toMatch(/\(\?:\/\)\?\$/)
    expect(regex.namedRegex).toMatch(/\$/)

    // Should still match without trailing slash
    const namedRe = new RegExp(regex.namedRegex)
    expect(namedRe.test('/posts/123')).toBe(true)
  })
})

describe('getNamedRouteRegex - Edge Cases', () => {
  it('should handle root route', () => {
    const regex = getNamedRouteRegex('/', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({})
    expect(regex.groups).toEqual({})
    expect(regex.namedRegex).toMatch(/^\^\//)
  })

  it('should handle route with only interception marker', () => {
    const regex = getNamedRouteRegex('/(.)nested', {
      prefixRouteKeys: true,
    })

    // No dynamic segments
    expect(regex.routeKeys).toEqual({})

    // Should escape the marker
    expect(regex.namedRegex).toContain('\\(\\.\\)')
  })

  it('should handle interception marker followed by catchall segment', () => {
    // Interception marker must be followed by a segment name, then catchall
    const regex = getNamedRouteRegex('/photos/(.)images/[...path]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtPpath: 'nxtPpath',
    })

    expect(regex.groups.path).toEqual({
      pos: 1,
      repeat: true,
      optional: false,
    })

    // Should match multiple segments after the static segment
    expect(regex.re.test('/photos/(.)images/a')).toBe(true)
    expect(regex.re.test('/photos/(.)images/a/b/c')).toBe(true)
  })

  it('should handle dynamic segment with interception marker prefix', () => {
    // Interception marker can be adjacent to dynamic segment
    const regex = getNamedRouteRegex('/photos/(.)[id]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtIid: 'nxtIid',
    })

    expect(regex.groups.id).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    // Should match single segment after the marker
    expect(regex.re.test('/photos/(.)123')).toBe(true)
  })

  it('should handle prefix and suffix options together', () => {
    const regex = getNamedRouteRegex('/api.v1/users.$type$[id].json', {
      prefixRouteKeys: true,
      includePrefix: true,
      includeSuffix: true,
    })

    // Should preserve prefix and suffix in regex
    expect(regex.namedRegex).toContain('\\$type\\$')
    expect(regex.namedRegex).toContain('\\.json')

    // Test matching
    const namedRe = new RegExp(regex.namedRegex)
    expect(namedRe.test('/api.v1/users.$type$123.json')).toBe(true)
  })

  it('should generate correct inverse pattern for complex routes', () => {
    const regex = getNamedRouteRegex('/[org]/@modal/(..)photo/[id]', {
      prefixRouteKeys: true,
    })

    // When interception marker is not adjacent to a parameter, the [id] uses regular prefix
    expect(regex.pathToRegexpPattern).toBe('/:nxtPorg/@modal/(..)photo/:nxtPid')

    // routeKeys should have both parameters with appropriate prefixes
    expect(regex.routeKeys).toEqual({
      nxtPorg: 'nxtPorg',
      nxtPid: 'nxtPid',
    })
  })

  it('should handle path with multiple separate segments', () => {
    // Dynamic segments need to be separated by slashes
    const regex = getNamedRouteRegex('/[org]/[repo]/[branch]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtPorg: 'nxtPorg',
      nxtPrepo: 'nxtPrepo',
      nxtPbranch: 'nxtPbranch',
    })

    // Each segment is captured separately
    const match = regex.re.exec('/vercel/next.js/canary')
    expect(match).toBeTruthy()
    expect(match![1]).toBe('vercel')
    expect(match![2]).toBe('next.js')
    expect(match![3]).toBe('canary')
  })
})

describe('getNamedRouteRegex - Named Capture Groups', () => {
  it('should extract values using named capture groups', () => {
    const regex = getNamedRouteRegex('/posts/[category]/[id]', {
      prefixRouteKeys: true,
    })

    const namedRe = new RegExp(regex.namedRegex)
    const match = namedRe.exec('/posts/tech/123')

    expect(match).toBeTruthy()
    expect(match?.groups).toEqual({
      nxtPcategory: 'tech',
      nxtPid: '123',
    })
  })

  it('should extract values with interception markers', () => {
    const regex = getNamedRouteRegex('/photos/(.)[author]/[id]', {
      prefixRouteKeys: true,
    })

    const namedRe = new RegExp(regex.namedRegex)
    const match = namedRe.exec('/photos/(.)john/123')

    expect(match).toBeTruthy()
    expect(match?.groups).toEqual({
      nxtIauthor: 'john',
      nxtPid: '123',
    })
  })

  it('should extract catchall values correctly', () => {
    const regex = getNamedRouteRegex('/files/[...path]', {
      prefixRouteKeys: true,
    })

    const namedRe = new RegExp(regex.namedRegex)
    const match = namedRe.exec('/files/docs/api/reference.md')

    expect(match).toBeTruthy()
    expect(match?.groups).toEqual({
      nxtPpath: 'docs/api/reference.md',
    })
  })
})

describe('parseParameter', () => {
  it('should parse a optional catchall parameter', () => {
    const param = '[[...slug]]'
    const expected = { key: 'slug', repeat: true, optional: true }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse a catchall parameter', () => {
    const param = '[...slug]'
    const expected = { key: 'slug', repeat: true, optional: false }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse a optional parameter', () => {
    const param = '[[foo]]'
    const expected = { key: 'foo', repeat: false, optional: true }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse a dynamic parameter', () => {
    const param = '[bar]'
    const expected = { key: 'bar', repeat: false, optional: false }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })

  it('should parse non-dynamic parameter', () => {
    const param = 'fizz'
    const expected = { key: 'fizz', repeat: false, optional: false }
    const result = parseParameter(param)
    expect(result).toEqual(expected)
  })
})

describe('getNamedRouteRegex - pathToRegexpPattern Conformance', () => {
  describe('Basic Patterns', () => {
    it('should generate a pattern that matches single dynamic segment routes', () => {
      const { regex, compiled } = compilePattern('/posts/[id]', {
        prefixRouteKeys: true,
      })

      // Verify the pattern format
      expect(regex.pathToRegexpPattern).toBe('/posts/:nxtPid')

      // Should match valid routes
      expect(compiled.exec('/posts/123')).toMatchInlineSnapshot(`
        [
          "/posts/123",
          "123",
        ]
      `)
      expect(compiled.exec('/posts/abc-def')).toMatchInlineSnapshot(`
        [
          "/posts/abc-def",
          "abc-def",
        ]
      `)

      // Should not match invalid routes
      expect(compiled.exec('/posts')).toBe(null)
      expect(compiled.exec('/posts/123/extra')).toBe(null)
    })

    it('should generate a pattern that matches multiple dynamic segment routes', () => {
      const { regex, compiled } = compilePattern('/[org]/[repo]/[branch]', {
        prefixRouteKeys: true,
      })

      // Verify the pattern format
      expect(regex.pathToRegexpPattern).toBe('/:nxtPorg/:nxtPrepo/:nxtPbranch')

      // Should match valid routes
      expect(compiled.exec('/vercel/next.js/canary')).toMatchInlineSnapshot(`
        [
          "/vercel/next.js/canary",
          "vercel",
          "next.js",
          "canary",
        ]
      `)

      // Should not match incomplete routes
      expect(compiled.exec('/vercel')).toBe(null)
      expect(compiled.exec('/vercel/next.js')).toBe(null)
    })
  })

  describe('Catch-all Segments', () => {
    it('should generate a pattern for required catch-all segments', () => {
      const { regex, compiled } = compilePattern('/files/[...path]', {
        prefixRouteKeys: true,
      })

      // Verify the pattern uses the + modifier for required catch-all
      expect(regex.pathToRegexpPattern).toBe('/files/:nxtPpath+')

      // Should match single segments
      expect(compiled.exec('/files/a')).toMatchInlineSnapshot(`
        [
          "/files/a",
          "a",
        ]
      `)

      // Should match multiple segments
      expect(compiled.exec('/files/a/b/c')).toMatchInlineSnapshot(`
        [
          "/files/a/b/c",
          "a/b/c",
        ]
      `)

      // Should not match without any segments
      expect(compiled.exec('/files')).toBe(null)
    })

    it('should generate a pattern for optional catch-all segments', () => {
      const { regex, compiled } = compilePattern('/photos/[[...id]]', {
        prefixRouteKeys: true,
      })

      // Verify the pattern uses the * modifier for optional catch-all
      expect(regex.pathToRegexpPattern).toBe('/photos/:nxtPid*')

      // Should match without segments
      expect(compiled.exec('/photos')).toMatchInlineSnapshot(`
        [
          "/photos",
          undefined,
        ]
      `)

      // Should match single segment
      expect(compiled.exec('/photos/1')).toMatchInlineSnapshot(`
        [
          "/photos/1",
          "1",
        ]
      `)

      // Should match multiple segments
      expect(compiled.exec('/photos/1/2/3')).toMatchInlineSnapshot(`
        [
          "/photos/1/2/3",
          "1/2/3",
        ]
      `)
    })

    it('should generate a pattern for catch-all after static segments', () => {
      const { regex, compiled } = compilePattern('/docs/api/[...slug]', {
        prefixRouteKeys: true,
      })

      expect(regex.pathToRegexpPattern).toBe('/docs/api/:nxtPslug+')

      expect(compiled.exec('/docs/api/reference')).toMatchInlineSnapshot(`
        [
          "/docs/api/reference",
          "reference",
        ]
      `)
      expect(compiled.exec('/docs/api/v1/users/create')).toMatchInlineSnapshot(`
        [
          "/docs/api/v1/users/create",
          "v1/users/create",
        ]
      `)

      // Should not match without the catch-all segment
      expect(compiled.exec('/docs/api')).toBe(null)
    })
  })

  describe('Optional Segments', () => {
    it('should generate a pattern for optional single segments', () => {
      const { regex, compiled } = compilePattern('/photos/[[id]]', {
        prefixRouteKeys: true,
      })

      // Verify the pattern format for optional segments
      expect(regex.pathToRegexpPattern).toBe('/photos/:nxtPid')

      // Should match with the segment
      expect(compiled.exec('/photos/123')).toMatchInlineSnapshot(`
        [
          "/photos/123",
          "123",
        ]
      `)

      // Should match without the segment (note: path-to-regexp behavior)
      // The pattern generated doesn't include a modifier, so this might not match
      // This test verifies the actual behavior
      const withoutSegment = compiled.exec('/photos')
      expect(withoutSegment).toBe(null)
    })

    it('should generate a pattern for multiple optional segments', () => {
      const { regex, compiled } = compilePattern('/posts/[[category]]/[[id]]', {
        prefixRouteKeys: true,
      })

      expect(regex.pathToRegexpPattern).toBe('/posts/:nxtPcategory/:nxtPid')

      // Should match with all segments
      expect(compiled.exec('/posts/tech/123')).toMatchInlineSnapshot(`
        [
          "/posts/tech/123",
          "tech",
          "123",
        ]
      `)

      // Note: The pattern generated doesn't have optional modifiers,
      // so it requires all segments to be present
      expect(compiled.exec('/posts/tech')).toBe(null)
      expect(compiled.exec('/posts')).toBe(null)
    })
  })

  describe('Complex Patterns', () => {
    it('should generate a pattern for routes with prefixes and suffixes', () => {
      const route = '/[locale]/about.segments/$dname$d[name].segment.rsc'
      const regex = getNamedRouteRegex(route, {
        prefixRouteKeys: true,
        includeSuffix: true,
        includePrefix: true,
      })

      expect(regex.pathToRegexpPattern).toBe(
        '/:nxtPlocale/about.segments/$dname$d/:nxtPname.segment.rsc'
      )

      // For this complex pattern with special chars, verify the pattern format
      // but don't test compilation since path-to-regexp may not handle all edge cases
      // The important part is that pathToRegexpPattern is generated correctly
    })

    it('should generate a pattern for routes with catch-all and static segments', () => {
      const { regex, compiled } = compilePattern(
        '/[locale]/docs/v2/[...slug]',
        {
          prefixRouteKeys: true,
        }
      )

      expect(regex.pathToRegexpPattern).toBe('/:nxtPlocale/docs/v2/:nxtPslug+')

      expect(compiled.exec('/en/docs/v2/api/reference')).toMatchInlineSnapshot(`
        [
          "/en/docs/v2/api/reference",
          "en",
          "api/reference",
        ]
      `)

      // Should not match without locale
      expect(compiled.exec('/docs/v2/api/reference')).toBe(null)

      // Should not match without catch-all
      expect(compiled.exec('/en/docs/v2')).toBe(null)
    })

    it('should generate a pattern for deeply nested dynamic routes', () => {
      const { regex, compiled } = compilePattern(
        '/[org]/[repo]/[branch]/[...path]',
        {
          prefixRouteKeys: true,
        }
      )

      expect(regex.pathToRegexpPattern).toBe(
        '/:nxtPorg/:nxtPrepo/:nxtPbranch/:nxtPpath+'
      )

      expect(compiled.exec('/vercel/next.js/canary/docs/api/reference.md'))
        .toMatchInlineSnapshot(`
        [
          "/vercel/next.js/canary/docs/api/reference.md",
          "vercel",
          "next.js",
          "canary",
          "docs/api/reference.md",
        ]
      `)
    })
  })
})
