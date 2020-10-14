import { useRouter } from 'next/router'

export default () => (
  <p id="product">
    {useRouter().query.itemId
      ? `item: ${useRouter().query.itemId}`
      : `product: ${useRouter().query.productId}`}
  </p>
)
