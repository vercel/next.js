import { validateParamMatchingParams } from 'next/dist/build/static-paths/param-matching'

describe('parameter matching static export validation', () => {
  it.each(['blocking', 'fallback', 'dynamic', undefined] as const)(
    'requires an explicitly closed param when its mode is %s',
    (mode) => {
      expect(() =>
        validateParamMatchingParams(
          '/[lang]',
          mode === undefined ? {} : { lang: mode },
          new Set(),
          new Set(),
          [{ paramName: 'lang' }],
          'export'
        )
      ).toThrow('must configure parameter "lang" as "not-found"')
    }
  )

  it('requires every exported param to be explicitly closed for now', () => {
    expect(() =>
      validateParamMatchingParams(
        '/[lang]/[slug]',
        { lang: 'not-found', slug: 'fallback' },
        new Set(['lang', 'slug']),
        new Set(),
        [{ paramName: 'lang' }, { paramName: 'slug' }],
        'export'
      )
    ).toThrow('must configure parameter "slug" as "not-found"')
  })

  it('accepts explicitly closed params', () => {
    expect(() =>
      validateParamMatchingParams(
        '/[lang]/[slug]',
        { lang: 'not-found', slug: 'not-found' },
        new Set(['lang', 'slug']),
        new Set(),
        [{ paramName: 'lang' }, { paramName: 'slug' }],
        'export'
      )
    ).not.toThrow()
  })
})
