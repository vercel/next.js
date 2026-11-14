import { ImageResponse } from 'next/og'
import { getProduct } from '@bench/data'

// A dynamic route: the image is rendered on demand, not at build time. What
// the build pays for is the image metadata of every product page.
export const alt = 'Product'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function ProductImage({ params }) {
  const { locale, id } = await params
  const product = await getProduct(locale, id)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: '#f4f1ea',
          fontSize: 64,
        }}
      >
        <div style={{ fontSize: 32 }}>{product.brand}</div>
        <div>{product.name}</div>
      </div>
    ),
    size
  )
}
