import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <p>Welcome to our store!</p>
      <Link href="/product">View Product</Link>
    </main>
  )
}
