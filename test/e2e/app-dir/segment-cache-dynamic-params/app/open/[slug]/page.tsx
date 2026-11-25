import Link from 'next/link'

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

export default function Page() {
  return (
    <>
      <p id="open-product-page">Open product page</p>
      <Link href="/products/allowed" prefetch={false} id="navigate-allowed">
        Navigate to an allowed product without prefetching
      </Link>
    </>
  )
}
