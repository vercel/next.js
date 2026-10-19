import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ minHeight: '200vh', padding: '20px' }}>
      <h1>Home Page</h1>
      <ul>
        <li>
          <Link id="link-products-no-suspense" href="/products#category-42">
            /products#category-42 (No Suspense)
          </Link>
        </li>
        <li>
          <Link
            id="link-products-with-suspense"
            href="/products-with-suspense#category-42"
          >
            /products-with-suspense#category-42 (With Suspense)
          </Link>
        </li>
        <li>
          <Link id="link-nested-suspense" href="/nested-suspense#nested-target">
            /nested-suspense#nested-target (Nested Suspense)
          </Link>
        </li>
        <li>
          <Link id="link-nonexistent-hash" href="/products#nonexistent">
            /products#nonexistent (Missing Hash)
          </Link>
        </li>
        <li>
          <Link id="link-home" href="/">
            Home
          </Link>
        </li>
      </ul>
    </main>
  )
}
