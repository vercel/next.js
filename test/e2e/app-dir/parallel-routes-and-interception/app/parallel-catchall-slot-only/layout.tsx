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
        {/* /foo exists only as @children slot and should be rendered using [...catchAll] for the @slot slot */}
        <Link href="/parallel-catchall-slot-only/foo">foo only children</Link>
      </div>
      <div>
        {/* /bar doesn't exist as @children slot */}
        <Link href="/parallel-catchall-slot-only/bar">not existing bar</Link>
      </div>
    </div>
  )
}
