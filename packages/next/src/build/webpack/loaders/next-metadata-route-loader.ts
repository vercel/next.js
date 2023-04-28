import type webpack from 'webpack'
import path from 'path'
import { METADATA_RESOURCE_QUERY } from './metadata/discover'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'

const cacheHeader = {
  none: 'no-cache, no-store',
  longCache: 'public, immutable, no-transform, max-age=31536000',
  revalidate: 'public, max-age=0, must-revalidate',
}

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
function getStaticRouteCode(resourcePath: string, fileBaseName: string) {
  const cache =
    fileBaseName === 'favicon'
      ? 'public, max-age=0, must-revalidate'
      : process.env.NODE_ENV !== 'production'
      ? cacheHeader.none
      : cacheHeader.longCache
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
      'Cache-Control': ${JSON.stringify(cache)},
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
      'Cache-Control': ${JSON.stringify(cacheHeader.revalidate)},
    },
  })
}
`
}

// <metadata-image>/[id]/route.js
function getDynamicImageRouteCode(resourcePath: string) {
  return `\
import { NextResponse } from 'next/server'
import * as _imageModule from ${JSON.stringify(resourcePath)}

const imageModule = { ..._imageModule }

const handler = imageModule.default
const generateImageMetadata = imageModule.generateImageMetadata

export async function GET(_, ctx) {
  const { __metadata_id__ = [], ...params } = ctx.params
  const id = __metadata_id__[0]
  const imageMetadata = generateImageMetadata ? await generateImageMetadata({ params }) : null
  if (imageMetadata) {
    const hasId = imageMetadata.some((item) => { item.id === id })
    if (!hasId) {
      return new NextResponse(null, {
        status: 404,
      })
    }
  }
  return handler({ params, id })
}
`
}

function getDynamicSiteMapRouteCode(resourcePath: string) {
  // generateSitemaps
  return `\
import { NextResponse } from 'next/server'
import * as _sitemapModule from ${JSON.stringify(resourcePath)}
import { resolveRouteData } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

const sitemapModule = { ..._sitemapModule }
const handler = sitemapModule.default
const generateSitemaps = sitemapModule.generateSitemaps
const contentType = ${JSON.stringify(getContentType(resourcePath))}
const fileType = ${JSON.stringify(getFilenameAndExtension(resourcePath).name)}

export async function GET(_, ctx) {
  const sitemaps = generateSitemaps ? await generateSitemaps() : null
  let id = undefined

  if (sitemaps) {
    const { __metadata_id__ = [] } = ctx.params
    const targetId = __metadata_id__[0]
    id = sitemaps.find((item) => item.id.toString() === targetId)?.id
    if (id == null) {
      return new NextResponse(null, {
        status: 404,
      })
    }
  }

  const data = await handler({ id })
  const content = resolveRouteData(data, fileType)

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': ${JSON.stringify(cacheHeader.revalidate)},
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
    const { pageExtensions } = this.getOptions()

    const { name: fileBaseName, ext } = getFilenameAndExtension(resourcePath)
    const isDynamic = pageExtensions.includes(ext)

    let code = ''
    if (isDynamic) {
      if (fileBaseName === 'robots' || fileBaseName === 'manifest') {
        code = getDynamicTextRouteCode(resourcePath)
      } else if (fileBaseName === 'sitemap') {
        code = getDynamicSiteMapRouteCode(resourcePath)
      } else {
        code = getDynamicImageRouteCode(resourcePath)
      }
    } else {
      code = getStaticRouteCode(resourcePath, fileBaseName)
    }

    return code
  }

export default nextMetadataRouterLoader
