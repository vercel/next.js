/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { checkExports } from '../../../analysis/get-page-static-info'
import { parse } from '../../../swc'

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  const { resourcePath } = this

  const transformedSource = source
  if (typeof transformedSource !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const swcAST = await parse(transformedSource, {
    filename: resourcePath,
    isModule: 'unknown',
  })
  const { ssg, ssr } = checkExports(swcAST)

  const output = `
const { createProxy } = require("next/dist/build/webpack/loaders/next-flight-client-loader/module-proxy")\n
module.exports = createProxy(${JSON.stringify(
    resourcePath
  )}, { ssr: ${ssr}, ssg: ${ssg} })
`
  return output
}
