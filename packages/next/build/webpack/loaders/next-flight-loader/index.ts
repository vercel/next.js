import { RSC_MODULE_TYPES } from '../../../../shared/lib/constants'
import { getRSCModuleType } from '../../../analysis/get-page-static-info'
import { getModuleBuildInfo } from '../get-module-build-info'

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
  const buildInfo = getModuleBuildInfo(this._module)
  const rscType = getRSCModuleType(source)

  // Assign the RSC meta information to buildInfo.
  // Exclude next internal files which are not marked as client files
  buildInfo.rsc = { type: rscType }

  if (buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    return callback(null, source, sourceMap)
  }

  return callback(null, source, sourceMap)
}
