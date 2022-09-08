import path from 'path'
import { RSC_CLIENT_ENTRY } from '../../../../shared/lib/constants'
import { checkExports } from '../../../analysis/get-page-static-info'
import { parse } from '../../../swc'

function transformClient(resourcePath: string): string {
  const output = `
const { createProxy } = require("next/dist/build/webpack/loaders/next-flight-loader/module-proxy")\n
module.exports = createProxy(${JSON.stringify(resourcePath)})
`
  return output
}

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
  return /^(page|layout)\.[\w.]+$/.test(filename)
}

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const { resourcePath } = this
  const buildInfo = (this as any)._module.buildInfo

  const swcAST = await parse(source, {
    filename: resourcePath,
    isModule: 'unknown',
  })
  const isModule = swcAST.type === 'Module'
  const { body } = swcAST
  // TODO-APP: optimize the directive detection
  // Assume there're only "use strict" and "<type>-entry" directives at top,
  // so pick the 2 nodes
  const firstTwoNodes = body.slice(0, 2)
  const appDir = path.join(this.rootContext, 'app')
  const isUnderAppDir = containsPath(appDir, this.resourcePath)

  const createError = (name: string) =>
    new Error(
      `${name} is not supported in client components.\nFrom: ${this.resourcePath}`
    )

  const isResourcePageOrLayoutFile = isPageOrLayoutFile(this.resourcePath)

  // Assign the RSC meta information to buildInfo.
  buildInfo.rsc = {}
  for (const node of firstTwoNodes) {
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'StringLiteral'
    ) {
      if (node.expression.value === RSC_CLIENT_ENTRY) {
        // Detect client entry
        buildInfo.rsc.type = RSC_CLIENT_ENTRY
        break
      }
    }
  }

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

  if (buildInfo.rsc.type === RSC_CLIENT_ENTRY) {
    errorForInvalidDataFetching(this.emitError)
    const code = transformClient(this.resourcePath)
    return code
  }

  const code = transformServer(source, isModule)
  return code
}
