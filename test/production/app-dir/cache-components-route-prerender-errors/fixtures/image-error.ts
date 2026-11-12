import { createElement } from 'react'
import { ImageResponse } from 'next/og'

function BrokenImage(): never {
  throw new Error('image component failed during serialization')
}

export function GET() {
  return new ImageResponse(createElement(BrokenImage))
}
