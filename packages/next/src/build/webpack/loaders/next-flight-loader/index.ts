import { RSC_MOD_REF_PROXY_ALIAS } from '../../../../lib/constants'
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

  const moduleProxy =
    this._compiler.name === 'edge-server'
      ? 'next/dist/esm/build/webpack/loaders/next-flight-loader/module-proxy'
      : 'next/dist/build/webpack/loaders/next-flight-loader/module-proxy'

  const callback = this.async()

  // Assign the RSC meta information to buildInfo.
  // Exclude next internal files which are not marked as client files
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.rsc = getRSCModuleInformation(source)

  // A client boundary.
  if (buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    const sourceType = this._module?.parser?.sourceType
    const detectedClientEntryType = buildInfo.rsc.clientEntryType
    const clientRefs = buildInfo.rsc.clientRefs!

    // It's tricky to detect the type of a client boundary, but we should always
    // use the `module` type when we can, to support `export *` and `export from`
    // syntax in other modules that import this client boundary.
    let assumedSourceType = sourceType
    if (assumedSourceType === 'auto' && detectedClientEntryType === 'auto') {
      if (
        clientRefs.length === 0 ||
        (clientRefs.length === 1 && clientRefs[0] === '')
      ) {
        // If there's zero export detected in the client boundary, and it's the
        // `auto` type, we can safely assume it's a CJS module because it doesn't
        // have ESM exports.
        assumedSourceType = 'commonjs'
      } else if (!clientRefs.includes('*')) {
        // Otherwise, we assume it's an ESM module.
        assumedSourceType = 'module'
      }
    }

    if (assumedSourceType === 'module') {
      if (clientRefs.includes('*')) {
        return callback(
          new Error(
            `It's currently unsupport to use "export *" in a client boundary. Please use named exports instead.`
          )
        )
      }

      let esmSource = `\
import { createProxy } from "${moduleProxy}"
const proxy = createProxy(String.raw\`${this.resourcePath}\`)

// Accessing the __esModule property and exporting $$typeof are required here.
// The __esModule getter forces the proxy target to create the default export
// and the $$typeof value is for rendering logic to determine if the module
// is a client boundary.
export const { __esModule, $$typeof } = proxy;
export default proxy.default;
`
      let cnt = 0
      for (const ref of clientRefs) {
        if (ref !== '' && ref !== 'default') {
          esmSource += `
const e${cnt} = proxy["${ref}"];
export { e${cnt++} as ${ref} };`
        } else if (ref === '') {
          esmSource += `\nexports[''] = proxy[''];`
        }
      }

      return callback(null, esmSource, sourceMap)
    }
  }

  if (buildInfo.rsc?.type !== RSC_MODULE_TYPES.client) {
    if (noopHeadPath === this.resourcePath) {
      warnOnce(
        `Warning: You're using \`next/head\` inside the \`app\` directory, please migrate to the Metadata API. See https://nextjs.org/docs/app/api-reference/file-conventions/metadata for more details.`
      )
    }
  }

  return callback(
    null,
    source.replace(RSC_MOD_REF_PROXY_ALIAS, moduleProxy),
    sourceMap
  )
}
