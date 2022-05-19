import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'

export type MiddlewareLoaderOptions = {
  absolutePagePath: string
  page: string
}

export default function middlewareLoader(this: any) {
  const { absolutePagePath, page }: MiddlewareLoaderOptions = this.getOptions()
  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeMiddleware = {
    page: page.replace(/\/_middleware$/, '') || '/',
  }

  return `
        import { adapter } from 'next/dist/server/web/adapter'

        // The condition is true when the "process" module is provided
        if (process !== global.process) {
          // prefer local process but global.process has correct "env"
          process.env = global.process.env;
          global.process = process;
        }

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
