import loaderUtils from 'next/dist/compiled/loader-utils'

export type MiddlewareLoaderOptions = {
  absolutePagePath: string
  page: string
}

export default function middlewareLoader(this: any) {
  const { absolutePagePath, page }: MiddlewareLoaderOptions =
    loaderUtils.getOptions(this)
  const stringifiedPagePath = loaderUtils.stringifyRequest(
    this,
    absolutePagePath
  )

  return `
        import { adapter } from 'next/dist/server/web/adapter'

        var mod = require(${stringifiedPagePath})
        var handler = mod.middleware || mod.default;

        if (typeof handler !== 'function') {
          throw new Error('The Middleware "pages${page}" must export a \`middleware\` or a \`default\` function');
        }

        export default function (opts) {
          return adapter({
              ...opts,
              handler
          })
        }
    `
}
