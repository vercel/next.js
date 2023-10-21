import {
  RSC_MOD_REF_PROXY_ALIAS,
  WEBPACK_LAYERS,
} from '../../../../lib/constants'
import { RSC_MODULE_TYPES } from '../../../../shared/lib/constants'
import { warnOnce } from '../../../../shared/lib/utils/warn-once'
import { getRSCModuleInformation } from '../../../analysis/get-page-static-info'
import { getModuleBuildInfo } from '../get-module-build-info'

const noopHeadPath = require.resolve('next/dist/client/components/noop-head')
// For edge runtime it will be aliased to esm version by webpack
const MODULE_PROXY_PATH =
  'next/dist/build/webpack/loaders/next-flight-loader/module-proxy'

export default function transformSource(
  this: any,
  source: string,
  sourceMap: any
) {
  // Avoid buffer to be consumed
  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  // Assign the RSC meta information to buildInfo.
  // Exclude next internal files which are not marked as client files
  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.rsc = getRSCModuleInformation(source, true)

  // A client boundary.
  if (buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    const issuerLayer = this._module.layer
    const sourceType = this._module?.parser?.sourceType
    const detectedClientEntryType = buildInfo.rsc.clientEntryType
    const clientRefs = buildInfo.rsc.clientRefs!

    if (issuerLayer === WEBPACK_LAYERS.actionBrowser) {
      // You're importing a Server Action module ("use server") from a client module
      // (hence you're on the actionBrowser layer), and you're trying to import a
      // client module again from it. This is not allowed because of cyclic module
      // graph.
      this.callback(
        new Error(
          `You're importing a Client Component ("use client") from another Client Component imported Server Action file ("use server"). This is not allowed due to cyclic module graph between Server and Client.\nYou can work around it by defining and passing this Server Action from a Server Component into the Client Component via props.`
        )
      )
      return
    }

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
        this.callback(
          new Error(
            `It's currently unsupported to use "export *" in a client boundary. Please use named exports instead.`
          )
        )
        return
      }

      let esmSource = `\
import { createProxy } from "${MODULE_PROXY_PATH}"
const proxy = createProxy(String.raw\`${this.resourcePath}\`)

// Accessing the __esModule property and exporting $$typeof are required here.
// The __esModule getter forces the proxy target to create the default export
// and the $$typeof value is for rendering logic to determine if the module
// is a client boundary.
const { __esModule, $$typeof } = proxy;
const __default__ = proxy.default;
`
      let cnt = 0
      for (const ref of clientRefs) {
        if (ref === '') {
          esmSource += `\nexports[''] = proxy[''];`
        } else if (ref === 'default') {
          esmSource += `
export { __esModule, $$typeof };
export default __default__;`
        } else {
          esmSource += `
const e${cnt} = proxy["${ref}"];
export { e${cnt++} as ${ref} };`
        }
      }

      this.callback(null, esmSource, sourceMap)
      return
    }
  }

  if (buildInfo.rsc?.type !== RSC_MODULE_TYPES.client) {
    if (noopHeadPath === this.resourcePath) {
      warnOnce(
        `Warning: You're using \`next/head\` inside the \`app\` directory, please migrate to the Metadata API. See https://nextjs.org/docs/app/building-your-application/upgrading/app-router-migration#step-3-migrating-nexthead for more details.`
      )
    }
  }

  this.callback(
    null,
    source.replace(RSC_MOD_REF_PROXY_ALIAS, MODULE_PROXY_PATH),
    sourceMap
  )
}
