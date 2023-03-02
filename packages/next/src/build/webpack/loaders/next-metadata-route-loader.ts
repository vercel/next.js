import type webpack from 'webpack'

const staticFileRegex = /[\\/](robots\.txt|sitemap\.xml)/
function isStaticRoute(resourcePath: string) {
  return staticFileRegex.test(resourcePath)
}

const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction = function (
  content: string
) {
  const { resourcePath } = this

  const code = isStaticRoute(resourcePath)
    ? `import { NextResponse } from 'next/server'

const content = ${JSON.stringify(content)}
export function GET() {
  return new NextResponse(content, {
    status: 200,
  })
}

export const dynamic = 'force-static'
`
    : // TODO: handle the defined configs in routes file
      `export { default as GET } from ${JSON.stringify(resourcePath)}`

  return code
}

export default nextMetadataRouterLoader
