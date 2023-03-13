import type webpack from 'webpack'
import path from 'path'
import { isStaticMetadataRoute } from '../../../lib/is-app-route-route'

function getContentType(resourcePath: string) {
  const filename = path.basename(resourcePath)
  const [name, ext] = filename.split('.')
  if (name === 'favicon' && ext === 'ico') return 'image/x-icon'
  if (name === 'sitemap') return 'application/xml'
  if (name === 'robots') return 'text/plain'
  return 'text/plain'
}

// `import.meta.url` is the resource name of the current module.
// When it's static route, it could be favicon.ico, sitemap.xml, robots.txt etc.
const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction = function () {
  const { resourcePath } = this
  console.log(
    'isStaticMetadataRoute()',
    isStaticMetadataRoute(resourcePath),
    getContentType(resourcePath)
  )
  const code = isStaticMetadataRoute(resourcePath)
    ? `import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const buffer = fs.readFileSync(fileURLToPath(import.meta.url))
const contentType = ${JSON.stringify(getContentType(resourcePath))}

export function GET() {
  return new NextResponse(buffer, {
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
