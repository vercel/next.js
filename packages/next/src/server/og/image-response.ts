type OgModule = typeof import('@vercel/og')

function importModule(): Promise<typeof import('@vercel/og')> {
  return import(
    process.env.NEXT_RUNTIME === 'edge'
      ? '@vercel/og/index.edge.js'
      : '@vercel/og/index.node.js'
  )
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
    const readable = new ReadableStream({
      async start(controller) {
        const OGImageResponse: typeof import('@vercel/og').ImageResponse =
          // So far we have to manually determine which build to use,
          // as the auto resolving is not working
          (await importModule()).ImageResponse
        const imageResponse = new OGImageResponse(...args) as Response

        if (!imageResponse.body) {
          return controller.close()
        }

        const reader = imageResponse.body!.getReader()
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

    super(readable, {
      headers: {
        'content-type': 'image/png',
        'cache-control':
          process.env.NODE_ENV === 'development'
            ? 'no-cache, no-store'
            : 'public, immutable, no-transform, max-age=31536000',
        ...options.headers,
      },
      status: options.status,
      statusText: options.statusText,
    })
  }
}
