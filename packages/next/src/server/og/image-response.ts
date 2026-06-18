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

/**
 * The ImageResponse class allows you to generate dynamic images using JSX and CSS.
 * This is useful for generating social media images such as Open Graph images, Twitter cards, and more.
 *
 * Read more: [Next.js Docs: `ImageResponse`](https://nextjs.org/docs/app/api-reference/functions/image-response)
 */
export class ImageResponse extends Response {
  public static displayName = 'ImageResponse'
  constructor(...args: ConstructorParameters<OgModule['ImageResponse']>) {
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
            const imageResponse = new OGImageResponse(...args) as Response

            if (!imageResponse.body) {
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

    const options = args[1] || {}

    const headers = new Headers({
      'content-type': 'image/png',
      'cache-control':
        process.env.NODE_ENV === 'development'
          ? 'no-cache, no-store'
          : 'public, max-age=0, must-revalidate',
    })
    if (options.headers) {
      const newHeaders = new Headers(options.headers)
      newHeaders.forEach((value, key) => headers.set(key, value))
    }
    super(readable, {
      headers,
      status: options.status,
      statusText: options.statusText,
    })
  }
}
