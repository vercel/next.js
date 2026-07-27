import { useRouter } from 'next/router'

export default () => <p id="product">product: {useRouter().query.productId}</p>
