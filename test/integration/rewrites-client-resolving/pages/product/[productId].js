import { useRouter } from 'next/router'

export default () => (
  <>
    <p id="product">product: {useRouter().query.productId}</p>
    <p id="sector">sector: {useRouter().query.sector}</p>
  </>
)
