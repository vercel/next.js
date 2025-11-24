import Link from 'next/link'

export default function Layout({ children, slot }) {
  return (
    <div>
      <div>Main content</div>
      <div id="main">{children}</div>
      <div>
        Slot content:
        <div id="slot-content">{slot}</div>
      </div>

      <div>
        <Link href="/parallel-catchall/foo">foo</Link>
      </div>
      <div>
        <Link href="/parallel-catchall/bar">catchall bar</Link>
      </div>
      <div>
        <Link href="/parallel-catchall/baz">catchall baz</Link>
      </div>
    </div>
  )
}
