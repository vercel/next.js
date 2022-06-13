import { getModuleBuildInfo } from './get-module-build-info'
import { stringifyRequest } from '../stringify-request'

export type EdgeFunctionLoaderOptions = {
  absolutePagePath: string
  page: string
}

export default function middlewareLoader(this: any) {
  const { absolutePagePath, page }: EdgeFunctionLoaderOptions =
    this.getOptions()
  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeApiFunction = {
    page: page || '/',
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
          throw new Error('The Edge Function "pages${page}" must export a \`default\` function');
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
