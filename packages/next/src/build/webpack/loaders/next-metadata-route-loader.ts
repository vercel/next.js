import type webpack from 'webpack'
import path from 'path'
import { METADATA_RESOURCE_QUERY } from './metadata/discover'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'

type MetadataRouteLoaderOptions = {
  pageExtensions: string[]
}

function getFilenameAndExtension(resourcePath: string) {
  const filename = path.basename(resourcePath)
  const [name, ext] = filename.split('.')
  return { name, ext }
}

function getContentType(resourcePath: string) {
  let { name, ext } = getFilenameAndExtension(resourcePath)
  if (ext === 'jpg') ext = 'jpeg'

  if (name === 'favicon' && ext === 'ico') return 'image/x-icon'
  if (name === 'sitemap') return 'application/xml'
  if (name === 'robots') return 'text/plain'
  if (name === 'manifest') return 'application/manifest+json'

  if (ext === 'png' || ext === 'jpeg' || ext === 'ico' || ext === 'svg') {
    return imageExtMimeTypeMap[ext]
  }
  return 'text/plain'
}

// Strip metadata resource query string from `import.meta.url` to make sure the fs.readFileSync get the right path.
function getStaticRouteCode(resourcePath: string) {
  return `\
import fs from 'fs'
import { fileURLToPath } from 'url'
import { NextResponse } from 'next/server'

const contentType = ${JSON.stringify(getContentType(resourcePath))}
const resourceUrl = new URL(import.meta.url)
const filePath = fileURLToPath(resourceUrl).replace(${JSON.stringify(
    METADATA_RESOURCE_QUERY
  )}, '')
const buffer = fs.readFileSync(filePath)

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

function getDynamicTextRouteCode(resourcePath: string) {
  return `\
import { NextResponse } from 'next/server'
import handler from ${JSON.stringify(resourcePath)}
import { resolveRouteData } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

const contentType = ${JSON.stringify(getContentType(resourcePath))}
const fileType = ${JSON.stringify(getFilenameAndExtension(resourcePath).name)}

export async function GET() {
  const data = await handler()
  const content = resolveRouteData(data, fileType)

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
`
}

function getDynamicImageRouteCode(resourcePath: string) {
  return `\
import { NextResponse } from 'next/server'
import handler from ${JSON.stringify(resourcePath)}

export async function GET(req, ctx) {
  const res = await handler({ params: ctx.params })
  res.headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
  return res
}
`
}

// `import.meta.url` is the resource name of the current module.
// When it's static route, it could be favicon.ico, sitemap.xml, robots.txt etc.
// TODO-METADATA: improve the cache control strategy
const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction<MetadataRouteLoaderOptions> =
  function () {
    const { resourcePath } = this
    const { pageExtensions } = this.getOptions()

    const { name: fileBaseName, ext } = getFilenameAndExtension(resourcePath)
    const isDynamic = pageExtensions.includes(ext)

    let code = ''
    if (isDynamic) {
      if (
        fileBaseName === 'sitemap' ||
        fileBaseName === 'robots' ||
        fileBaseName === 'manifest'
      ) {
        code = getDynamicTextRouteCode(resourcePath)
      } else {
        code = getDynamicImageRouteCode(resourcePath)
      }
    } else {
      code = getStaticRouteCode(resourcePath)
    }

    return code
  }

export default nextMetadataRouterLoader
