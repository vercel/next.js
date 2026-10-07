import type { ImageResponseOptions as OgImageResponseOptions } from 'next/dist/compiled/@vercel/og/types'
import type { ImageResponseFormat } from './image-format'

export type { ImageResponseFormat }

export type ImageResponseOptions = OgImageResponseOptions & {
  /**
   * Output format of the generated image.
   *
   * @default 'png'
   */
  format?: ImageResponseFormat
  /**
   * Compression quality of the generated image (1-100).
   * Applies to lossy formats like `webp`, `avif`, and `jpeg`.
   */
  quality?: number
}

type OgModule = typeof import('next/dist/compiled/@vercel/og')

function importModule(): Promise<
  typeof import('next/dist/compiled/@vercel/og')
> {
  return import(
    process.env.NEXT_RUNTIME === 'edge'
      ? 'next/dist/compiled/@vercel/og/index.edge.js'
      : 'next/dist/compiled/@vercel/og/index.node.js'
  )
}

// The Cache Components-specific caching path (and its React Flight and Node
// stream dependencies) lives in a separate module that is only required for
// Node.js Cache Components builds. The `NEXT_RUNTIME` guard matters because
// `__NEXT_CACHE_COMPONENTS` is derived from config, not the per-route runtime,
// so it stays `true` in edge bundles too. A Pages Router edge route that
// renders an `ImageResponse` is valid under Cache Components, and without the
// guard this node-only module would be pulled into that edge bundle and fail to
// compile. (App Router edge routes, including metadata routes, are
// independently rejected at compile time under Cache Components.) Both checks
// fold to constants at build time, so the `require` is eliminated as dead code
// for edge builds and for apps without Cache Components, which keep
// ImageResponse's original streaming behavior.
let getCachedImageResponseBody:
  | typeof import('./cache-image-response').getCachedImageResponseBody
  | undefined
if (
  process.env.NEXT_RUNTIME !== 'edge' &&
  process.env.__NEXT_CACHE_COMPONENTS
) {
  getCachedImageResponseBody = (
    require('./cache-image-response') as typeof import('./cache-image-response')
  ).getCachedImageResponseBody
}

let transformImageFormat:
  | typeof import('./image-format').transformImageFormat
  | undefined
let getImageFormatContentType:
  | typeof import('./image-format').getImageFormatContentType
  | undefined

if (process.env.NEXT_RUNTIME !== 'edge') {
  const imageFormat =
    require('./image-format') as typeof import('./image-format')
  transformImageFormat = imageFormat.transformImageFormat
  getImageFormatContentType = imageFormat.getImageFormatContentType
} else {
  transformImageFormat = undefined
  getImageFormatContentType = undefined
}

/**
 * The ImageResponse class allows you to generate dynamic images using JSX and CSS.
 * This is useful for generating social media images such as Open Graph images, Twitter cards, and more.
 *
 * Read more: [Next.js Docs: `ImageResponse`](https://nextjs.org/docs/app/api-reference/functions/image-response)
 */
export class ImageResponse extends Response {
  public static displayName = 'ImageResponse'
  constructor(
    element: ConstructorParameters<OgModule['ImageResponse']>[0],
    options?: ImageResponseOptions
  ) {
    const opts = options || {}
    const format = opts.format || 'png'
    const args = [element, opts] as [
      ConstructorParameters<OgModule['ImageResponse']>[0],
      ImageResponseOptions,
    ]

    // Under Cache Components, route the render through the cache so metadata
    // image routes can be statically prerendered. Otherwise stream the rendered
    // image directly from the underlying `@vercel/og` response.
    const readable = getCachedImageResponseBody
      ? getCachedImageResponseBody(args)
      : new ReadableStream({
          async start(controller) {
            const OGImageResponse: typeof import('next/dist/compiled/@vercel/og').ImageResponse =
              // So far we have to manually determine which build to use, as the
              // auto resolving is not working
              (await importModule()).ImageResponse
            const imageResponse = new OGImageResponse(element, opts) as Response

            if (!imageResponse.body) {
              return controller.close()
            }

            if (format && format !== 'png') {
              if (!transformImageFormat) {
                throw new Error(
                  `ImageResponse format "${format}" is not supported in the Edge runtime. Please use Node.js runtime or default to "png".`
                )
              }
              const arrayBuffer = await imageResponse.arrayBuffer()
              const convertedBuffer = await transformImageFormat(
                arrayBuffer,
                format,
                opts.quality
              )
              controller.enqueue(new Uint8Array(convertedBuffer))
              return controller.close()
            }

            const reader = imageResponse.body.getReader()
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                return controller.close()
              }
              controller.enqueue(value)
            }
          },
        })

    const defaultContentType = getImageFormatContentType
      ? getImageFormatContentType(opts.format)
      : opts.format === 'webp'
        ? 'image/webp'
        : opts.format === 'avif'
          ? 'image/avif'
          : opts.format === 'jpeg' || opts.format === 'jpg'
            ? 'image/jpeg'
            : 'image/png'

    const headers = new Headers({
      'content-type': defaultContentType,
      'cache-control':
        process.env.NODE_ENV === 'development'
          ? 'no-cache, no-store'
          : 'public, max-age=0, must-revalidate',
    })
    if (opts.headers) {
      const newHeaders = new Headers(opts.headers)
      newHeaders.forEach((value, key) => headers.set(key, value))
    }
    super(readable, {
      headers,
      status: opts.status,
      statusText: opts.statusText,
    })
  }
}
