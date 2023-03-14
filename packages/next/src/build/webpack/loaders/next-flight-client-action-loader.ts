import { getRSCModuleInformation } from './../../analysis/get-page-static-info'
import { getModuleBuildInfo } from './get-module-build-info'

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
  buildInfo.rsc = getRSCModuleInformation(source, false)

  // TODO: This should only allow file-level "use server", not per-function.
  if (buildInfo.rsc.actions) {
    console.log(this.resourcePath, buildInfo.rsc)
  }

  return callback(null, source, sourceMap)
}
