import Link from 'next/link'

export const instant = false

export default function Page() {
  return (
    <main>
      <h1>Intercepted Test Index</h1>
      <Link href="/intercepted/plain/1" id="link-plain">
        Open plain 1
      </Link>
      <br />
      <Link href="/intercepted/item/1" id="link-item">
        Open item 1
      </Link>
    </main>
  )
}
