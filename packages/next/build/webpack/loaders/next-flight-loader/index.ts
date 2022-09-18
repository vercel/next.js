import path from 'path'
import { RSC_MODULE_TYPES } from '../../../../shared/lib/constants'
import {
  checkExports,
  getRSCModuleType,
} from '../../../analysis/get-page-static-info'
import { parse } from '../../../swc'
import { getModuleBuildInfo } from '../get-module-build-info'

function transformServer(source: string, isESModule: boolean) {
  return (
    source +
    (isESModule ? `export const __next_rsc__` : `exports.__next_rsc__`) +
    ` = { __webpack_require__, server: true }\n`
  )
}

function containsPath(parent: string, child: string) {
  const relation = path.relative(parent, child)
  return !!relation && !relation.startsWith('..') && !path.isAbsolute(relation)
}

const isPageOrLayoutFile = (filePath: string) => {
  const filename = path.basename(filePath)
  return /[\\/]?(page|layout)\.(js|ts)x?$/.test(filename)
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
  const isModule = swcAST.type === 'Module'
  const createError = (name: string) =>
    new Error(
      `${name} is not supported in client components.\nFrom: ${this.resourcePath}`
    )
  const appDir = path.join(this.rootContext, 'app')
  const isUnderAppDir = containsPath(appDir, this.resourcePath)
  const isResourcePageOrLayoutFile = isPageOrLayoutFile(this.resourcePath)
  // If client entry has any gSSP/gSP data fetching methods, error
  function errorForInvalidDataFetching(onError: (error: any) => void) {
    if (isUnderAppDir && isResourcePageOrLayoutFile) {
      const { ssg, ssr } = checkExports(swcAST)
      if (ssg) {
        onError(createError('getStaticProps'))
      }
      if (ssr) {
        onError(createError('getServerSideProps'))
      }
    }
  }

  // Assign the RSC meta information to buildInfo.
  // Exclude next internal files which are not marked as client files
  buildInfo.rsc = { type: rscType }

  if (buildInfo.rsc?.type === RSC_MODULE_TYPES.client) {
    errorForInvalidDataFetching(this.emitError)
    return callback(null, source, sourceMap)
  }

  const code = transformServer(source, isModule)
  return callback(null, code, sourceMap)
}
