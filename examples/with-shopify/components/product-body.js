import ProductImage from './product-image'

export default function ProductBody({ product }) {
  const variant = product.variants.edges[0].node

  return (
    <div>
      <ProductImage image={variant.image} title={product.title} large />
    </div>
  )
}
