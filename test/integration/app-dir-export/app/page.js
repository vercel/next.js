import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <Link href="/another">Visit without trailingslash</Link>
      <br />
      <Link href="/another/">Visit with trailingslash</Link>
    </main>
  )
}
