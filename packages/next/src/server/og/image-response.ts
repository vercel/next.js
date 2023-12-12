import {
  ImageResponse,
  experimental_FigmaImageResponse,
} from 'next/dist/compiled/@vercel/og'

// Set the `displayName` property to the original `ImageResponse` class.
// @ts-ignore
ImageResponse.displayName = 'ImageResponse'

export { ImageResponse, experimental_FigmaImageResponse }
