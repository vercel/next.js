import type { normalizeLocalePath as Fn } from '../shared/lib/i18n/normalize-locale-path'

export const normalizeLocalePath: typeof Fn = (pathname, locales) => {
  if (process.env.__NEXT_I18N_SUPPORT) {
    return (
      require('../shared/lib/i18n/normalize-locale-path') as typeof import('../shared/lib/i18n/normalize-locale-path')
    ).normalizeLocalePath(pathname, locales)
  }
  return { pathname, detectedLocale: undefined }
}
