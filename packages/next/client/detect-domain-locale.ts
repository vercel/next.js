import type { detectDomainLocale as Fn } from '../shared/lib/i18n/detect-domain-locale'

export const detectDomainLocale: typeof Fn = (...args) => {
  if (process.env.__NEXT_I18N_SUPPORT) {
    return require('../shared/lib/i18n/detect-domain-locale').detectDomainLocale(
      ...args
    )
  }
}
