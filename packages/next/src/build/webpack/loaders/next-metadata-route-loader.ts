import type webpack from 'webpack'
import path from 'path'
import { isMetadataRouteFile } from '../../../lib/metadata/is-metadata-route'
import { METADATA_RESOURCE_QUERY } from './metadata/discover'

type MetadataRouteLoaderOptions = {
  route: string
}

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
  // TODO-METADATA: align with next metadata image loader mime type generation
  if (ext === 'png' || ext === 'jpg') return `image/${ext}`
  return 'text/plain'
}

// Strip metadata resource query string from `import.meta.url` to make sure the fs.readFileSync get the right path.
function getStaticRouteCode(resourcePath: string) {
  return `\
import fs from 'fs'
import { fileURLToPath } from 'url'
import { NextResponse } from 'next/server'

const resourceUrl = fileURLToPath(import.meta.url).replace(${JSON.stringify(
    METADATA_RESOURCE_QUERY
  )}, '')
const buffer = fs.readFileSync(resourceUrl)
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
}

function getDynamicRouteCode(resourcePath: string) {
  return `\
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
}

// `import.meta.url` is the resource name of the current module.
// When it's static route, it could be favicon.ico, sitemap.xml, robots.txt etc.
// TODO-METADATA: improve the cache control strategy
const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction<MetadataRouteLoaderOptions> =
  function () {
    const { resourcePath } = this
    const { route } = this.getOptions()

    const isStatic = isMetadataRouteFile(route, [])
    const code = isStatic
      ? getStaticRouteCode(resourcePath)
      : getDynamicRouteCode(resourcePath)

    return code
  }

export default nextMetadataRouterLoader
