import type { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

export default function nextErrorServerBinaryLoader(
  this: webpack.LoaderContext<any>
) {
  let relativePath = path.relative(this.rootContext, this.resourcePath)
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }
  throw new Error(
    `Node.js binary module '${relativePath}' cannot be bundled. The package it belongs to should be added to \`serverExternalPackages\`. See https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages for more information.`
  )
}
