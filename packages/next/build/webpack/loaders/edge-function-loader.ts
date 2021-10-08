import loaderUtils from 'next/dist/compiled/loader-utils'

export type EdgeFunctionLoaderOptions = {
  absolutePagePath: string
}

export default function edgeFunctionLoader(this: any) {
  const { absolutePagePath }: EdgeFunctionLoaderOptions =
    loaderUtils.getOptions(this)
  const stringifiedAbsolutePagePath = JSON.stringify(absolutePagePath)

  return `
        import { adapter } from 'next/dist/server/edge-functions-whatwg'
        import { Request } from 'next/dist/server/edge-functions-whatwg'
        import { Response } from 'next/dist/server/edge-functions-whatwg'

        var mod = require(${stringifiedAbsolutePagePath})
        var handler = mod.middleware || mod.default;

        if (typeof handler !== 'function') {
          throw new Error('Your Edge Function must export a \`middleware\` or a \`default\` function');
        }

        export function edgeFunction(opts) {
          return adapter({
              ...opts,
              handler
          })
        }

        export { Request }
        export { Response }
    `
}
