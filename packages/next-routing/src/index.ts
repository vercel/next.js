export { resolveRoutes } from './resolve-routes'
export type {
  RouteHas,
  Route,
  MiddlewareContext,
  MiddlewareResult,
  ResolveRoutesParams,
  ResolveRoutesResult,
} from './types'
export type { I18nConfig, I18nDomain } from './i18n'
export {
  detectLocale,
  detectDomainLocale,
  normalizeLocalePath,
  getAcceptLanguageLocale,
  getCookieLocale,
} from './i18n'
export { responseToMiddlewareResult } from './middleware'
