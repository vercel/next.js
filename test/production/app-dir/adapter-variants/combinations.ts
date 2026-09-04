import { locale, theme } from './variants'

/**
 * The combinations every route in this fixture declares.
 *
 * The set of variant keys is fixed, and only the number of enumerated
 * combinations changes. Therefore a build with more combinations differs from a
 * build with fewer along one axis, and the routing entries that a route
 * contributes can be compared between the two.
 *
 * `VARIANT_LOCALES` selects the count: one locale gives two combinations, two
 * give four. The test builds the fixture once for each.
 */
export function combinations() {
  const themes = ['light', 'dark']
  const locales = process.env.VARIANT_LOCALES === '2' ? ['en', 'de'] : ['en']

  return locales.flatMap((localeValue) =>
    themes.map((themeValue) => [
      [theme, themeValue],
      [locale, localeValue],
    ])
  )
}
