import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { RSC_MOD_REF_PROXY_ALIAS } from '../../../../lib/constants'
import {
  BARREL_OPTIMIZATION_PREFIX,
  RSC_MODULE_TYPES,
} from '../../../../shared/lib/constants'
import { warnOnce } from '../../../../shared/lib/utils/warn-once'
import { getRSCModuleInformation } from '../../../analysis/get-page-static-info'
import { formatBarrelOptimizedResource } from '../../utils'
import { getModuleBuildInfo } from '../get-module-build-info'

const noopHeadPath = require.resolve('next/dist/client/components/noop-head')
// For edge runtime it will be aliased to esm version by webpack
const MODULE_PROXY_PATH =
  'next/dist/build/webpack/loaders/next-flight-loader/module-proxy'

type SourceType = 'auto' | 'commonjs' | 'module'
export function getAssumedSourceType(
  mod: webpack.Module,
  sourceType: SourceType
): SourceType {
  const buildInfo = getModuleBuildInfo(mod)
  const detectedClientEntryType = buildInfo?.rsc?.clientEntryType
  const clientRefs = buildInfo?.rsc?.clientRefs || []

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
  return assumedSourceType
}

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

  // Resource key is the unique identifier for the resource. When RSC renders
  // a client module, that key is used to identify that module across all compiler
  // layers.
  //
  // Usually it's the module's file path + the export name (e.g. `foo.js#bar`).
  // But with Barrel Optimizations, one file can be splitted into multiple modules,
  // so when you import `foo.js#bar` and `foo.js#baz`, they are actually different
  // "foo.js" being created by the Barrel Loader (one only exports `bar`, the other
  // only exports `baz`).
  //
  // Because of that, we must add another query param to the resource key to
  // differentiate them.
  let resourceKey: string = this.resourcePath
  if (this._module?.matchResource?.startsWith(BARREL_OPTIMIZATION_PREFIX)) {
    resourceKey = formatBarrelOptimizedResource(
      resourceKey,
      this._module.matchResource
    )
  }

  // A client boundary.
  if (buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    const assumedSourceType = getAssumedSourceType(
      this._module,
      this._module?.parser?.sourceType
    )
    const clientRefs = buildInfo.rsc.clientRefs!

    if (assumedSourceType === 'module') {
      if (clientRefs.includes('*')) {
        this.callback(
          new Error(
            `It's currently unsupported to use "export *" in a client boundary. Please use named exports instead.`
          )
        )
        return
      }

      // `proxy` is the module proxy that we treat the module as a client boundary.
      // For ESM, we access the property of the module proxy directly for each export.
      // This is bit hacky that treating using a CJS like module proxy for ESM's exports,
      // but this will avoid creating nested proxies for each export. It will be improved in the future.
      let esmSource = `\
import { createProxy } from "${MODULE_PROXY_PATH}"

const proxy = createProxy(String.raw\`${this.resourcePath}\`)
`
      let cnt = 0
      for (const ref of clientRefs) {
        if (ref === '') {
          esmSource += `\nexports[''] = proxy[''];`
        } else if (ref === 'default') {
          esmSource += `\
export default createProxy(String.raw\`${resourceKey}#default\`);
`
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

  const replacedSource = source.replace(
    RSC_MOD_REF_PROXY_ALIAS,
    MODULE_PROXY_PATH
  )
  this.callback(null, replacedSource, sourceMap)
}
