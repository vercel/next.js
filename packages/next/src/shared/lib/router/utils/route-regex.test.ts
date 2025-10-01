import { getNamedRouteRegex } from './route-regex'
import { parseParameter } from './get-dynamic-param'

describe('getNamedRouteRegex', () => {
  it('should handle interception markers adjacent to dynamic path segments', () => {
    const regex = getNamedRouteRegex('/photos/(.)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtIauthor: 'nxtIauthor',
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.groups['id']).toEqual({
      pos: 2,
      repeat: false,
      optional: false,
    })

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
    let namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(.)[author]/[id]')).toBe(true)

    regex = getNamedRouteRegex('/(..)(..)[author]/[id]', {
      prefixRouteKeys: true,
    })
    expect(regex.namedRegex).toMatchInlineSnapshot(
      `"^/\\(\\.\\.\\)\\(\\.\\.\\)(?<nxtIauthor>[^/]+?)/(?<nxtPid>[^/]+?)(?:/)?$"`
    )
    namedRegexp = new RegExp(regex.namedRegex)
    expect(namedRegexp.test('/[author]/[id]')).toBe(false)
    expect(namedRegexp.test('/(..)(..)[author]/[id]')).toBe(true)
  })

  it('should handle multi-level interception markers', () => {
    const regex = getNamedRouteRegex('/photos/(..)(..)[author]/[id]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtIauthor: 'nxtIauthor',
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

    expect(regex.groups['id']).toEqual({
      pos: 2,
      repeat: false,
      optional: false,
    })

    expect(regex.re.source).toMatchInlineSnapshot(
      `"^\\/photos\\/\\(\\.\\.\\)\\(\\.\\.\\)([^/]+?)\\/([^/]+?)(?:\\/)?$"`
    )

    expect(regex.re.exec('/photos/(..)(..)next/123')).toMatchInlineSnapshot(`
     [
       "/photos/(..)(..)next/123",
       "next",
       "123",
     ]
    `)
  })

  it('should not remove extra parts beside the param segments', () => {
    const { re, namedRegex, routeKeys } = getNamedRouteRegex(
      '/[locale]/about.segments/[...segmentPath].segment.rsc',
      {
        prefixRouteKeys: true,
        includeSuffix: true,
      }
    )
    expect(routeKeys).toEqual({
      nxtPlocale: 'nxtPlocale',
      nxtPsegmentPath: 'nxtPsegmentPath',
    })
    expect(namedRegex).toMatchInlineSnapshot(
      `"^/(?<nxtPlocale>[^/]+?)/about\\.segments/(?<nxtPsegmentPath>.+?)\\.segment\\.rsc(?:/)?$"`
    )
    expect(re.source).toMatchInlineSnapshot(
      `"^\\/([^/]+?)\\/about\\.segments\\/(.+?)\\.segment\\.rsc(?:\\/)?$"`
    )
  })

  it('should not remove extra parts in front of the param segments', () => {
    const { re, namedRegex, routeKeys } = getNamedRouteRegex(
      '/[locale]/about.segments/$dname$d[name].segment.rsc',
      {
        prefixRouteKeys: true,
        includeSuffix: true,
        includePrefix: true,
      }
    )
    expect(routeKeys).toEqual({
      nxtPlocale: 'nxtPlocale',
      nxtPname: 'nxtPname',
    })
    expect(namedRegex).toEqual(
      '^/(?<nxtPlocale>[^/]+?)/about\\.segments/\\$dname\\$d(?<nxtPname>[^/]+?)\\.segment\\.rsc(?:/)?$'
    )
    expect(re.source).toEqual(
      '^\\/([^/]+?)\\/about\\.segments\\/\\$dname\\$d([^/]+?)\\.segment\\.rsc(?:\\/)?$'
    )

    expect('/en/about.segments/$dname$dwyatt.segment.rsc'.match(re))
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

    expect(regex.namedRegex).toMatchInlineSnapshot(
      `"^/photos/\\(\\.\\)author/(?<nxtPid>[^/]+?)(?:/)?$"`
    )

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['author']).toBeUndefined()

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: false,
      optional: false,
    })

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

    expect(regex.routeKeys).toEqual({
      nxtPid: 'nxtPid',
    })

    expect(regex.groups['id']).toEqual({
      pos: 1,
      repeat: true,
      optional: true,
    })

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

    // Hyphens should be removed from the key, but routeKeys maps sanitized → original
    expect(regex.routeKeys).toEqual({
      nxtPfoobar: 'nxtPfoo-bar',
    })

    // The reference maps original → sanitized
    expect(regex.reference).toEqual({
      'foo-bar': 'nxtPfoobar',
    })

    // Named regex should use the sanitized name
    expect(regex.namedRegex).toContain('(?<nxtPfoobar>')
  })

  it('should sanitize parameter names with underscores', () => {
    const regex = getNamedRouteRegex('/[foo_id]/page', {
      prefixRouteKeys: true,
    })

    // Underscores should be removed from parameter names
    expect(regex.routeKeys).toEqual({
      nxtPfoo_id: 'nxtPfoo_id',
    })

    // Original key is preserved in reference
    expect(regex.reference).toEqual({
      foo_id: 'nxtPfoo_id',
    })
  })

  it('should handle parameters with multiple special characters', () => {
    const regex = getNamedRouteRegex('/[this-is_my-route]/page', {
      prefixRouteKeys: true,
    })

    // Special characters are removed for the sanitized key, but routeKeys maps back to original
    expect(regex.routeKeys).toEqual({
      nxtPthisis_myroute: 'nxtPthis-is_my-route',
    })

    expect(regex.reference).toEqual({
      'this-is_my-route': 'nxtPthisis_myroute',
    })
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
    expect(regex1.reference.lang).toBe(regex2.reference.lang)
    expect(regex2.reference.lang).toBe('nxtPlang')

    // New parameter should be added to the reference
    expect(regex2.reference.id).toBe('nxtPid')
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
    expect(baseRegex.reference.locale).toBe(interceptedRegex.reference.locale)
    expect(interceptedRegex.reference.locale).toBe('nxtPlocale')
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

    // Should have only one key
    expect(Object.keys(regex.routeKeys)).toHaveLength(1)
    expect(regex.routeKeys.nxtPid).toBe('nxtPid')

    // Named regex should contain a backreference for the second occurrence
    expect(regex.namedRegex).toContain('\\k<nxtPid>')
  })

  it('should handle duplicate parameters without backreferences', () => {
    const regex = getNamedRouteRegex('/[id]/posts/[id]', {
      prefixRouteKeys: true,
      backreferenceDuplicateKeys: false,
    })

    // Should still have only one key
    expect(Object.keys(regex.routeKeys)).toHaveLength(1)

    // But no backreference in the pattern
    expect(regex.namedRegex).not.toContain('\\k<')
  })
})

describe('getNamedRouteRegex - Complex Paths', () => {
  it('should handle paths with multiple dynamic segments', () => {
    const regex = getNamedRouteRegex('/[org]/[repo]/[branch]/[...path]', {
      prefixRouteKeys: true,
    })

    expect(regex.routeKeys).toEqual({
      nxtPorg: 'nxtPorg',
      nxtPrepo: 'nxtPrepo',
      nxtPbranch: 'nxtPbranch',
      nxtPpath: 'nxtPpath',
    })

    expect(regex.groups).toEqual({
      org: { pos: 1, repeat: false, optional: false },
      repo: { pos: 2, repeat: false, optional: false },
      branch: { pos: 3, repeat: false, optional: false },
      path: { pos: 4, repeat: true, optional: false },
    })

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

      // Should use interception prefix
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
    expect(regex.namedRegex).toMatch(/\(\?:\/\)\?\$/)

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
