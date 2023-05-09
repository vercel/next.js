import type webpack from 'webpack'
import fs from 'fs'
import path from 'path'
import { METADATA_RESOURCE_QUERY } from './metadata/discover'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'

const cacheHeader = {
  none: 'no-cache, no-store',
  longCache: 'public, immutable, no-transform, max-age=31536000',
  revalidate: 'public, max-age=0, must-revalidate',
}

type MetadataRouteLoaderOptions = {
  page: string
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
async function getStaticRouteCode(resourcePath: string, fileBaseName: string) {
  const cache =
    fileBaseName === 'favicon'
      ? 'public, max-age=0, must-revalidate'
      : process.env.NODE_ENV !== 'production'
      ? cacheHeader.none
      : cacheHeader.longCache
  const code = `\
import { NextResponse } from 'next/server'

const contentType = ${JSON.stringify(getContentType(resourcePath))}
const buffer = Buffer.from(${JSON.stringify(
    (
      await fs.promises.readFile(
        resourcePath.replace(METADATA_RESOURCE_QUERY, '')
      )
    ).toString('base64')
  )}, 'base64'
  )

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
  return code
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
  const { __metadata_id__ = [], ...params } = ctx.params || {}
  const targetId = __metadata_id__[0]
  let id = undefined
  const imageMetadata = generateImageMetadata ? await generateImageMetadata({ params }) : null

  if (imageMetadata) {
    id = imageMetadata.find((item) => {
      if (process.env.NODE_ENV !== 'production') {
        if (item?.id == null) {
          throw new Error('id is required for every item returned from generateImageMetadata')
        }
      }
      return item.id.toString() === targetId
    })?.id
    if (id == null) {
      return new NextResponse('Not Found', {
        status: 404,
      })
    }
  }
  return handler({ params: ctx.params ? params : undefined, id })
}
`
}

function getDynamicSiteMapRouteCode(resourcePath: string, page: string) {
  let staticGenerationCode = ''

  if (
    process.env.NODE_ENV === 'production' &&
    page.includes('[__metadata_id__]')
  ) {
    staticGenerationCode = `\
export async function generateStaticParams() {
  const sitemaps = await generateSitemaps()
  const params = []

  for (const item of sitemaps) {
    params.push({ __metadata_id__: item.id.toString() + '.xml' })
  }
  return params
}
    `
  }

  const code = `\
import { NextResponse } from 'next/server'
import * as _sitemapModule from ${JSON.stringify(resourcePath)}
import { resolveRouteData } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

const sitemapModule = { ..._sitemapModule }
const handler = sitemapModule.default
const generateSitemaps = sitemapModule.generateSitemaps
const contentType = ${JSON.stringify(getContentType(resourcePath))}
const fileType = ${JSON.stringify(getFilenameAndExtension(resourcePath).name)}

export async function GET(_, ctx) {
  const { __metadata_id__ = [], ...params } = ctx.params || {}
  const targetId = __metadata_id__[0]
  let id = undefined
  const sitemaps = generateSitemaps ? await generateSitemaps() : null

  if (sitemaps) {
    id = sitemaps.find((item) => {
      if (process.env.NODE_ENV !== 'production') {
        if (item?.id == null) {
          throw new Error('id property is required for every item returned from generateSitemaps')
        }
      }
      return item.id.toString() === targetId
    })?.id
    if (id == null) {
      return new NextResponse('Not Found', {
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

${staticGenerationCode}
`
  return code
}
// `import.meta.url` is the resource name of the current module.
// When it's static route, it could be favicon.ico, sitemap.xml, robots.txt etc.
// TODO-METADATA: improve the cache control strategy
const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction<MetadataRouteLoaderOptions> =
  async function () {
    const { resourcePath } = this
    const { pageExtensions, page } = this.getOptions()

    const { name: fileBaseName, ext } = getFilenameAndExtension(resourcePath)
    const isDynamic = pageExtensions.includes(ext)

    let code = ''
    if (isDynamic) {
      if (fileBaseName === 'robots' || fileBaseName === 'manifest') {
        code = getDynamicTextRouteCode(resourcePath)
      } else if (fileBaseName === 'sitemap') {
        code = getDynamicSiteMapRouteCode(resourcePath, page)
      } else {
        code = getDynamicImageRouteCode(resourcePath)
      }
    } else {
      code = await getStaticRouteCode(resourcePath, fileBaseName)
    }

    return code
  }

export default nextMetadataRouterLoader
