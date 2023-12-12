import {
  ImageResponse as OriginalImageResponse,
  experimental_FigmaImageResponse,
} from 'next/dist/compiled/@vercel/og'

// Set the `displayName` property to the original `ImageResponse` class.
// @ts-ignore
OriginalImageResponse.displayName = 'ImageResponse'

export { OriginalImageResponse, experimental_FigmaImageResponse }
