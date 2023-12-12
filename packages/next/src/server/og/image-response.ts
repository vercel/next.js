export * from 'next/dist/compiled/@vercel/og'

// import type { ImageResponse as OriginImageResponse } from 'next/dist/compiled/@vercel/og'

// const imageModulePromise = import(
//   process.env.NEXT_RUNTIME === 'edge'
//     ? 'next/dist/compiled/@vercel/og/index.edge.js'
//     : 'next/dist/compiled/@vercel/og/index.node.js'
// )

// export class ImageResponse extends Response {
//   public static displayName = 'NextImageResponse'
//   constructor(
//     ...args: ConstructorParameters<typeof OriginImageResponse>
//   ) {
//     const readable = new ReadableStream({
//       async start(controller) {
//         const OGImageResponse: typeof import('next/dist/compiled/@vercel/og').ImageResponse =
//           // So far we have to manually determine which build to use,
//           // as the auto resolving is not working
//           (await imageModulePromise).ImageResponse
//         const imageResponse = new OGImageResponse(...args) as Response

//         if (!imageResponse.body) {
//           return controller.close()
//         }

//         const reader = imageResponse.body!.getReader()
//         while (true) {
//           const { done, value } = await reader.read()
//           if (done) {
//             return controller.close()
//           }
//           controller.enqueue(value)
//         }
//       },
//     })

//     const options = args[1] || {}

//     super(readable, {
//       headers: {
//         'content-type': 'image/png',
//         'cache-control':
//           process.env.NODE_ENV === 'development'
//             ? 'no-cache, no-store'
//             : 'public, immutable, no-transform, max-age=31536000',
//         ...options.headers,
//       },
//       status: options.status,
//       statusText: options.statusText,
//     })
//   }
// }

// export { } from 'next/dist/compiled/@vercel/og'
