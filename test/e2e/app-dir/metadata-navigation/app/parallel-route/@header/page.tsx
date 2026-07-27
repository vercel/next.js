import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div>Home header</div>
      <Link href="/parallel-route/product" id="product-link">
        Product
      </Link>
    </div>
  )
}
