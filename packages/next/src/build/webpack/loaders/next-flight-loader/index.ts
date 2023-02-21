import { RSC_MODULE_TYPES } from '../../../../shared/lib/constants'
import { warnOnce } from '../../../../shared/lib/utils/warn-once'
import { getRSCModuleInformation } from '../../../analysis/get-page-static-info'
import { getModuleBuildInfo } from '../get-module-build-info'

const noopHeadPath = require.resolve('next/dist/client/components/noop-head')

export default async function transformSource(
  this: any,
  source: string,
  sourceMap: any
) {
  // Avoid buffer to be consumed
  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const callback = this.async()

  // Assign the RSC meta information to buildInfo.
  // Exclude next internal files which are not marked as client files
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.rsc = getRSCModuleInformation(source)

  const isESM = this._module?.parser?.sourceType === 'module'

  // A client boundary.
  if (isESM && buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    const clientRefs = buildInfo.rsc.clientRefs!
    if (clientRefs.includes('*')) {
      return callback(
        new Error(
          `It's currently unsupport to use "export *" in a client boundary. Please use named exports instead.`
        )
      )
    }

    // For ESM, we can't simply export it as a proxy via `module.exports`.
    // Use multiple named exports instead.
    const proxyFilepath = source.match(/createProxy\((.+)\)/)?.[1]
    if (!proxyFilepath) {
      return callback(
        new Error(
          `Failed to find the proxy file path in the client boundary. This is a bug in Next.js.`
        )
      )
    }

    let esmSource = `
    import { createProxy } from "private-next-rsc-mod-ref-proxy"
    const proxy = createProxy(${proxyFilepath})
    `
    let cnt = 0
    for (const ref of clientRefs) {
      if (ref === 'default') {
        esmSource += `\nexport default proxy.default`
      } else {
        esmSource += `\nconst e${cnt} = proxy["${ref}"]\nexport { e${cnt++} as ${ref} }`
      }
    }

    return callback(null, esmSource, sourceMap)
  }

  if (buildInfo.rsc?.type !== RSC_MODULE_TYPES.client) {
    if (noopHeadPath === this.resourcePath) {
      warnOnce(
        `Warning: You're using \`next/head\` inside the \`app\` directory, please migrate to the Metadata API. See https://beta.nextjs.org/docs/api-reference/metadata for more details.`
      )
    }
  }

  return callback(null, source, sourceMap)
}
