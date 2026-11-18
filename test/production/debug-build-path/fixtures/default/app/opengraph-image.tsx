import { ImageResponse } from 'next/og'

export default function Image() {
  return new ImageResponse(<div>Open Graph image</div>)
}
