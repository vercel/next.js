import Link from 'next/link'

export default function Home() {
  return (
    <div id="root-page">
      <p>Home Page</p>
      <Link href="/cart">Open cart</Link>
      <br />
      <Link href="/catch-all">Open catch all</Link>
    </div>
  )
}
