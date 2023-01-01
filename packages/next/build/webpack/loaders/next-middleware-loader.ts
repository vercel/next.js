import type { MiddlewareMatcher } from '../../analysis/get-page-static-info'
import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'
import { MIDDLEWARE_LOCATION_REGEXP } from '../../../lib/constants'

export type MiddlewareLoaderOptions = {
  absolutePagePath: string
  page: string
  rootDir: string
  matchers?: string
}

// matchers can have special characters that break the loader params
// parsing so we base64 encode/decode the string
export function encodeMatchers(matchers: MiddlewareMatcher[]) {
  return Buffer.from(JSON.stringify(matchers)).toString('base64')
}

export function decodeMatchers(encodedMatchers: string) {
  return JSON.parse(
    Buffer.from(encodedMatchers, 'base64').toString()
  ) as MiddlewareMatcher[]
}

export default function middlewareLoader(this: any) {
  const {
    absolutePagePath,
    page,
    rootDir,
    matchers: encodedMatchers,
  }: MiddlewareLoaderOptions = this.getOptions()
  const matchers = encodedMatchers ? decodeMatchers(encodedMatchers) : undefined
  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeMiddleware = {
    matchers,
    page:
      page.replace(new RegExp(`/${MIDDLEWARE_LOCATION_REGEXP}$`), '') || '/',
  }
  buildInfo.rootDir = rootDir

  return `
        import { adapter, enhanceGlobals } from 'next/dist/esm/server/web/adapter'

        enhanceGlobals()

        var mod = require(${stringifiedPagePath})
        var handler = mod.middleware || mod.default;

        if (typeof handler !== 'function') {
          throw new Error('The Middleware "pages${page}" must export a \`middleware\` or a \`default\` function');
        }

        export default function (opts) {
          return adapter({
              ...opts,
              page: ${JSON.stringify(page)},
              handler,
          })
        }
    `
}
