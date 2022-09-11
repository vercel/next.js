/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'path'
import { checkExports } from '../../../analysis/get-page-static-info'
import { parse } from '../../../swc'

function containsPath(parent: string, child: string) {
  const relation = path.relative(parent, child)
  return !!relation && !relation.startsWith('..') && !path.isAbsolute(relation)
}

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  if (typeof source !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const appDir = path.join(this.rootContext, 'app')
  const isUnderAppDir = containsPath(appDir, this.resourcePath)
  const filename = path.basename(this.resourcePath)
  const isPageOrLayoutFile = /^(page|layout)\.client\.\w+$/.test(filename)

  const createError = (name: string) =>
    new Error(
      `${name} is not supported in client components.\nFrom: ${this.resourcePath}`
    )

  if (isUnderAppDir && isPageOrLayoutFile) {
    const swcAST = await parse(source, {
      filename: this.resourcePath,
      isModule: 'unknown',
    })
    const { ssg, ssr } = checkExports(swcAST)
    if (ssg) {
      this.emitError(createError('getStaticProps'))
    }
    if (ssr) {
      this.emitError(createError('getServerSideProps'))
    }
  }

  const output = `
const { createProxy } = require("next/dist/build/webpack/loaders/next-flight-client-loader/module-proxy")\n
module.exports = createProxy(${JSON.stringify(this.resourcePath)})
`
  return output
}
