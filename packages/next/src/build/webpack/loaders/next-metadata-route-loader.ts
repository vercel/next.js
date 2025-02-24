import type webpack from 'webpack'
import fs from 'fs'
import path from 'path'
import { imageExtMimeTypeMap } from '../../../lib/mime-type'
import { getLoaderModuleNamedExports } from './utils'

function errorOnBadHandler(resourcePath: string) {
  return `
  if (typeof handler !== 'function') {
    throw new Error('Default export is missing in ${JSON.stringify(
      resourcePath
    )}')
  }
  `
}

/* re-export the userland route configs */
async function createReExportsCode(
  resourcePath: string,
  loaderContext: webpack.LoaderContext<any>
) {
  const exportNames = await getLoaderModuleNamedExports(
    resourcePath,
    loaderContext
  )
  // Re-export configs but avoid conflicted exports
  const reExportNames = exportNames.filter(
    (name) => name !== 'default' && name !== 'generateSitemaps'
  )

  return reExportNames.length > 0
    ? `export { ${reExportNames.join(', ')} } from ${JSON.stringify(
        resourcePath
      )}\n`
    : ''
}

const cacheHeader = {
  none: 'no-cache, no-store',
  longCache: 'public, immutable, no-transform, max-age=31536000',
  revalidate: 'public, max-age=0, must-revalidate',
}

export type MetadataRouteLoaderOptions = {
  // Using separate argument to avoid json being parsed and hit error
  // x-ref: https://github.com/vercel/next.js/pull/62615
  filePath: string
  isDynamicRouteExtension: '1' | '0'
}

export function getFilenameAndExtension(resourcePath: string) {
  const filename = path.basename(resourcePath)
  const [name, ext] = filename.split('.', 2)
  return {
    name,
    ext,
  }
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

async function getStaticAssetRouteCode(
  resourcePath: string,
  fileBaseName: string
) {
  const cache =
    fileBaseName === 'favicon'
      ? 'public, max-age=0, must-revalidate'
      : process.env.NODE_ENV !== 'production'
        ? cacheHeader.none
        : cacheHeader.longCache

  const isTwitter = fileBaseName === 'twitter-image'
  const isOpenGraph = fileBaseName === 'opengraph-image'
  // Twitter image file size limit is 5MB.
  // General Open Graph image file size limit is 8MB.
  // x-ref: https://developer.x.com/en/docs/x-for-websites/cards/overview/summary
  // x-ref(facebook): https://developers.facebook.com/docs/sharing/webmasters/images
  const fileSizeLimit = isTwitter ? 5 : 8
  const imgName = isTwitter ? 'Twitter' : 'Open Graph'

  const code = `\
/* static asset route */
import { NextResponse } from 'next/server'

const contentType = ${JSON.stringify(getContentType(resourcePath))}
const buffer = Buffer.from(${JSON.stringify(
    (await fs.promises.readFile(resourcePath)).toString('base64')
  )}, 'base64'
  )

if (${isTwitter || isOpenGraph}) {
  const fileSizeInMB = buffer.byteLength / 1024 / 1024
  if (fileSizeInMB > ${fileSizeLimit}) {
    throw new Error('File size for ${imgName} image ${JSON.stringify(resourcePath)} exceeds ${fileSizeLimit}MB. ' +
    \`(Current: \${fileSizeInMB.toFixed(2)}MB)\n\` +
    'Read more: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image#image-files-jpg-png-gif'
    )
  }
}

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

async function getDynamicTextRouteCode(
  resourcePath: string,
  loaderContext: webpack.LoaderContext<any>
) {
  return `\
/* dynamic asset route */
import { NextResponse } from 'next/server'
import handler from ${JSON.stringify(resourcePath)}
import { resolveRouteData } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

const contentType = ${JSON.stringify(getContentType(resourcePath))}
const fileType = ${JSON.stringify(getFilenameAndExtension(resourcePath).name)}

${errorOnBadHandler(resourcePath)}
${await createReExportsCode(resourcePath, loaderContext)}

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
async function getDynamicImageRouteCode(
  resourcePath: string,
  loaderContext: webpack.LoaderContext<any>
) {
  return `\
/* dynamic image route */
import { NextResponse } from 'next/server'
import * as userland from ${JSON.stringify(resourcePath)}

const imageModule = { ...userland }

const handler = imageModule.default
const generateImageMetadata = imageModule.generateImageMetadata

${errorOnBadHandler(resourcePath)}
${await createReExportsCode(resourcePath, loaderContext)}

export async function GET(_, ctx) {
  const params = await ctx.params
  const { __metadata_id__, ...rest } = params || {}
  const restParams = params ? rest : undefined
  const targetId = __metadata_id__
  let id = undefined
  
  if (generateImageMetadata) {
    const imageMetadata = await generateImageMetadata({ params: restParams })
    id = imageMetadata.find((item) => {
      if (process.env.NODE_ENV !== 'production') {
        if (item?.id == null) {
          throw new Error('id property is required for every item returned from generateImageMetadata')
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

  return handler({ params: restParams, id })
}
`
}

async function getDynamicSitemapRouteCode(
  resourcePath: string,
  loaderContext: webpack.LoaderContext<any>
) {
  let staticGenerationCode = ''

  const exportNames = await getLoaderModuleNamedExports(
    resourcePath,
    loaderContext
  )

  const hasGenerateSitemaps = exportNames.includes('generateSitemaps')

  if (process.env.NODE_ENV === 'production' && hasGenerateSitemaps) {
    staticGenerationCode = `\
    /* dynamic sitemap route */
    export async function generateStaticParams() {
      const sitemaps = await sitemapModule.generateSitemaps()
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
import * as userland from ${JSON.stringify(resourcePath)}
import { resolveRouteData } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'

const sitemapModule = { ...userland }
const handler = sitemapModule.default
const contentType = ${JSON.stringify(getContentType(resourcePath))}
const fileType = ${JSON.stringify(getFilenameAndExtension(resourcePath).name)}

${errorOnBadHandler(resourcePath)}
${await createReExportsCode(resourcePath, loaderContext)}

export async function GET(_, ctx) {
  const { __metadata_id__: id, ...params } = await ctx.params || {}
  const hasXmlExtension = id ? id.endsWith('.xml') : false

  if (id && !hasXmlExtension) {
    return new NextResponse('Not Found', {
      status: 404,
    })
  }

  if (process.env.NODE_ENV !== 'production' && sitemapModule.generateSitemaps) {
    const sitemaps = await sitemapModule.generateSitemaps()
    for (const item of sitemaps) {
      if (item?.id == null) {
        throw new Error('id property is required for every item returned from generateSitemaps')
      }
    }
  }

  const targetId = id && hasXmlExtension ? id.slice(0, -4) : undefined

  const data = await handler({ id: targetId })
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

// When it's static route, it could be favicon.ico, sitemap.xml, robots.txt etc.
// TODO-METADATA: improve the cache control strategy
const nextMetadataRouterLoader: webpack.LoaderDefinitionFunction<MetadataRouteLoaderOptions> =
  async function () {
    const { isDynamicRouteExtension, filePath } = this.getOptions()
    const { name: fileBaseName } = getFilenameAndExtension(filePath)
    this.addDependency(filePath)

    let code = ''
    if (isDynamicRouteExtension === '1') {
      if (fileBaseName === 'robots' || fileBaseName === 'manifest') {
        code = await getDynamicTextRouteCode(filePath, this)
      } else if (fileBaseName === 'sitemap') {
        code = await getDynamicSitemapRouteCode(filePath, this)
      } else {
        code = await getDynamicImageRouteCode(filePath, this)
      }
    } else {
      code = await getStaticAssetRouteCode(filePath, fileBaseName)
    }

    return code
  }

export default nextMetadataRouterLoader
