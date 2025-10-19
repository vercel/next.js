import type {
  ProxyConfig,
  ProxyMatcher,
} from '../../analysis/get-page-static-info'
import { getModuleBuildInfo } from './get-module-build-info'
import {
  MIDDLEWARE_LOCATION_REGEXP,
  PROXY_LOCATION_REGEXP,
} from '../../../lib/constants'
import { loadEntrypoint } from '../../load-entrypoint'

export type MiddlewareLoaderOptions = {
  absolutePagePath: string
  page: string
  rootDir: string
  matchers?: string
  preferredRegion: string | string[] | undefined
  middlewareConfig: string
}

// matchers can have special characters that break the loader params
// parsing so we base64 encode/decode the string
export function encodeMatchers(matchers: ProxyMatcher[]) {
  return Buffer.from(JSON.stringify(matchers)).toString('base64')
}

export function decodeMatchers(encodedMatchers: string) {
  return JSON.parse(
    Buffer.from(encodedMatchers, 'base64').toString()
  ) as ProxyMatcher[]
}

export default async function middlewareLoader(this: any) {
  const {
    absolutePagePath,
    page,
    rootDir,
    matchers: encodedMatchers,
    preferredRegion,
    middlewareConfig: middlewareConfigBase64,
  }: MiddlewareLoaderOptions = this.getOptions()
  const matchers = encodedMatchers ? decodeMatchers(encodedMatchers) : undefined
  const pagePath = this.utils.contextify(
    this.context || this.rootContext,
    absolutePagePath
  )

  const middlewareConfig: ProxyConfig = JSON.parse(
    Buffer.from(middlewareConfigBase64, 'base64').toString()
  )
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeMiddleware = {
    matchers,
    page:
      page.replace(
        new RegExp(
          `/(${MIDDLEWARE_LOCATION_REGEXP}|${PROXY_LOCATION_REGEXP})$`
        ),
        ''
      ) || '/',
  }
  buildInfo.rootDir = rootDir
  buildInfo.route = {
    page,
    absolutePagePath,
    preferredRegion,
    middlewareConfig,
  }

  return await loadEntrypoint('middleware', {
    VAR_USERLAND: pagePath,
    VAR_DEFINITION_PAGE: page,
    // Turbopack sets `VAR_USERLAND` to `INNER_MIDDLEWARE_MODULE`, so use
    // `VAR_MODULE_RELATIVE_PATH` for error messages.
    VAR_MODULE_RELATIVE_PATH: pagePath,
  })
}
