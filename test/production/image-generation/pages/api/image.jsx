import { ImageResponse } from '@vercel/og'

export default async () => {
  return new ImageResponse(<div tw="w-full h-full text-5xl">hello</div>)
}

export const config = {
  runtime: 'edge',
}
