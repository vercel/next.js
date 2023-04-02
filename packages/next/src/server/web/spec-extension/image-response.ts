export class ImageResponse {
  constructor(
    ...args: ConstructorParameters<
      typeof import('next/dist/compiled/@vercel/og').ImageResponse
    >
  ) {
    // @ts-expect-error - process.turbopack is a custom property
    if (process.turbopack) {
      // TODO(sokra) enable this again when turbopack supports wasm
      throw new Error("Turbopack doesn't support ImageResponse currently")
    } else {
      const readable = new ReadableStream({
        async start(controller) {
          const OGImageResponse: typeof import('next/dist/compiled/@vercel/og').ImageResponse =
            // So far we have to manually determine which build to use,
            // as the auto resolving is not working
            (
              await import(
                process.env.NEXT_RUNTIME === 'edge'
                  ? 'next/dist/compiled/@vercel/og/index.edge'
                  : 'next/dist/compiled/@vercel/og/index.node'
              )
            ).ImageResponse
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

      return new Response(readable, {
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
}
