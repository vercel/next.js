import { RSC_MODULE_TYPES } from '../../../../shared/lib/constants'
import { getRSCModuleType } from '../../../analysis/get-page-static-info'
import { parse } from '../../../swc'
import { getModuleBuildInfo } from '../get-module-build-info'

function transformServer(source: string, isESModule: boolean) {
  return (
    source +
    (isESModule ? `export const __next_rsc__` : `exports.__next_rsc__`) +
    ` = { __webpack_require__, server: true }\n`
  )
}

export default async function transformSource(
  this: any,
  source: string,
  sourceMap: any
) {
  // Avoid buffer to be consumed
  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const { resourcePath } = this
  const callback = this.async()
  const buildInfo = getModuleBuildInfo(this._module)
  const swcAST = await parse(source, {
    filename: resourcePath,
    isModule: 'unknown',
  })

  const rscType = getRSCModuleType(source)

  // Assign the RSC meta information to buildInfo.
  // Exclude next internal files which are not marked as client files
  buildInfo.rsc = { type: rscType }

  if (buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    return callback(null, source, sourceMap)
  }

  const isModule = swcAST.type === 'Module'
  const code = transformServer(source, isModule)
  return callback(null, code, sourceMap)
}
