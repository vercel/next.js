'use client'

import React from 'react'
import { FacebookPixel, trackPixelEvent } from '@next/third-parties/meta'

const Page = () => {
  const onClick = () => {
    trackPixelEvent('addToCart', { product: 'xyz' })
  }

  return (
    <div className="container">
      <FacebookPixel pixelId="FB-XYZ" />
      <h1>Facebook Pixel</h1>
      <button id="facebook-pixel-send" onClick={onClick}>
        Add to cart
      </button>
      <FacebookPixel pixelId="FB-XYZ" />
    </div>
  )
}

export default Page
