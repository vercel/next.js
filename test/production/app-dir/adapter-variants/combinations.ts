import { locale, theme } from './variants'

/**
 * Returns two or four combinations without changing their variant keys.
 * `VARIANT_LOCALES` selects the count, so the test can vary only that axis.
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
