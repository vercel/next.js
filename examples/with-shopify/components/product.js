import Link from 'next/link'
import ProductImage from './product-image'

export default function Product({ product }) {
  const variant = product.variants.edges[0].node
  const { amount, currencyCode } = variant.priceV2
  const formatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  })
  const price = formatCurrency.format(amount)

  console.log(variant)

  return (
    <div>
      <div className="mb-5">
        <ProductImage
          image={variant.image}
          title={product.title}
          slug={product.handle}
        />
      </div>
      <h3 className="text-3xl mb-3 leading-snug">
        <Link as={`/posts/${product.handle}`} href="/posts/[slug]">
          <a className="hover:underline">{product.title}</a>
        </Link>
      </h3>
      <p className="text-lg mb-4">{price}</p>
    </div>
  )
}
