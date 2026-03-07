import Image from 'next/image'
import ProductGallery from './ProductGallery'

export default function Page() {
  return (
    <div>
      <h1>Welcome to Our Store</h1>

      {/* Good example: using Next.js Image component */}
      <Image
        src="/hero-image.jpg"
        alt="Store hero image"
        width={800}
        height={400}
        priority
      />

      <section>
        <h2>Featured Products</h2>
        <ProductGallery />
      </section>
    </div>
  )
}
