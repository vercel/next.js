import type webpack from 'webpack'
import path from 'path'

const staticFileRegex = /[\\/](robots\.txt|sitemap\.xml)/

function isStaticRoute(resourcePath: string) {
  return staticFileRegex.test(resourcePath)
}

function getContentType(resourcePath: string) {
  const filename = path.basename(resourcePath)
  const [name] = filename.split('.')
  if (name === 'sitemap') return 'application/xml'
  if (name === 'robots') return 'text/plain'
  return 'text/plain'
}

const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction = function (
  content: string
) {
  const { resourcePath } = this

  const code = isStaticRoute(resourcePath)
    ? `import { NextResponse } from 'next/server'

const content = ${JSON.stringify(content)}
const contentType = ${JSON.stringify(getContentType(resourcePath))}
export function GET() {
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': contentType,
    },
  })
}

export const dynamic = 'force-static'
`
    : // TODO: handle the defined configs in routes file
      `export { default as GET } from ${JSON.stringify(resourcePath)}`

  return code
}

export default nextMetadataRouterLoader
