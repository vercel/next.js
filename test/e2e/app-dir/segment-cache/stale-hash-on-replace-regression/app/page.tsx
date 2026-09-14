import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1 id="home">Home</h1>
      <Link id="link-to-product" href="/p/123#modal">
        Open product with hash
      </Link>
    </>
  )
}
