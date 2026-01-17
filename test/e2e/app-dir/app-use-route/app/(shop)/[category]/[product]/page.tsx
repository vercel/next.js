import { RouteDisplay } from '../../../components/route-display'

export function generateStaticParams() {
  return [
    { category: 'electronics', product: 'laptop' },
    { category: 'books', product: 'novel' },
  ]
}

export default function Page() {
  return (
    <div>
      <h1>Shop Product</h1>
      <RouteDisplay testId="shop-product-page" />
    </div>
  )
}
