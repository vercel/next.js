import type { webpack } from 'next/dist/compiled/webpack/webpack'

const nodeBinaryRegex = /node_modules[\\/].*?\.node$/

export default function nextErrorBrowserBinaryLoader(
  this: webpack.LoaderContext<any>,
  content: string
) {
  const { resourcePath, rootContext } = this
  if (nodeBinaryRegex.test(resourcePath)) {
    const relativePath = resourcePath.slice(rootContext.length + 1)
    throw new Error(
      `Node.js binary module ./${relativePath} is not supported in the browser. Please only use the module on server side`
    )
  }

  return content
}
