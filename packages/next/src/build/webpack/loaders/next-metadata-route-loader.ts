import type webpack from 'webpack'
import path from 'path'
import { isStaticMetadataRoute } from '../../../lib/metadata/is-metadata-route'

function getFilenameAndExtension(resourcePath: string) {
  const filename = path.basename(resourcePath)
  const [name, ext] = filename.split('.')
  return { name, ext }
}

function getContentType(resourcePath: string) {
  const { name, ext } = getFilenameAndExtension(resourcePath)
  if (name === 'favicon' && ext === 'ico') return 'image/x-icon'
  if (name === 'sitemap') return 'application/xml'
  if (name === 'robots') return 'text/plain'
  return 'text/plain'
}

// `import.meta.url` is the resource name of the current module.
// When it's static route, it could be favicon.ico, sitemap.xml, robots.txt etc.
// TODO-METADATA: improve the cache control strategy
const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction = function () {
  const { resourcePath } = this
  const isStatic = isStaticMetadataRoute(resourcePath)
  const code = isStatic
    ? `\
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const buffer = fs.readFileSync(fileURLToPath(import.meta.url))
const contentType = ${JSON.stringify(getContentType(resourcePath))}

export function GET() {
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}

export const dynamic = 'force-static'
`
    : `\
import { NextResponse } from 'next/server'
import handler from ${JSON.stringify(resourcePath)}
import { resolveRouteData } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

const contentType = ${JSON.stringify(getContentType(resourcePath))}
const name = ${JSON.stringify(getFilenameAndExtension(resourcePath).name)}

export async function GET() {
  const data = await handler()
  const content = resolveRouteData(data, name)

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
`

  return code
}

export default nextMetadataRouterLoader
