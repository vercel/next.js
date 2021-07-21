import loaderUtils from 'next/dist/compiled/loader-utils'

export type EdgeFunctionLoaderOptions = {
  absolutePagePath: string
}

export default function nextEdgeLoader(this: any) {
  const { absolutePagePath }: EdgeFunctionLoaderOptions =
    loaderUtils.getOptions(this)
  const stringifiedAbsolutePagePath = JSON.stringify(absolutePagePath)

  return `
        import { adapter } from 'next/dist/server/edge-functions'
        
        var mod = require(${stringifiedAbsolutePagePath})
        var handler = mod.middleware || mod.default;

        if (typeof handler !== 'function') {
          throw new Error('Your Edge Function must export a \`middleware\` or a \`default\` function');
        }

        export default function edgeFunction (opts) {
            return adapter({
                ...opts,
                handler
            })
        }
    `
}
