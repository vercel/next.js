import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'
import { MIDDLEWARE_LOCATION_REGEXP } from '../../../lib/constants'

export type MiddlewareLoaderOptions = {
  absolutePagePath: string
  page: string
  matcherRegexp?: string
}

export default function middlewareLoader(this: any) {
  const {
    absolutePagePath,
    page,
    matcherRegexp: base64MatcherRegex,
  }: MiddlewareLoaderOptions = this.getOptions()
  const matcherRegexp = Buffer.from(
    base64MatcherRegex || '',
    'base64'
  ).toString()
  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeMiddleware = {
    matcherRegexp,
    page:
      page.replace(new RegExp(`/${MIDDLEWARE_LOCATION_REGEXP}$`), '') || '/',
  }

  return `
        import { adapter, blockUnallowedResponse, enhanceGlobals } from 'next/dist/server/web/adapter'

        enhanceGlobals()

        var mod = require(${stringifiedPagePath})
        var handler = mod.middleware || mod.default;

        if (typeof handler !== 'function') {
          throw new Error('The Middleware "pages${page}" must export a \`middleware\` or a \`default\` function');
        }

        export default function (opts) {
          return blockUnallowedResponse(adapter({
              ...opts,
              page: ${JSON.stringify(page)},
              handler,
          }))
        }
    `
}
