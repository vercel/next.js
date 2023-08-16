import Link from 'next/link'

export default function Layout({ children, slot, groupslot }) {
  return (
    <div>
      <h1>Main Layout</h1>
      {children}
      <div id="slot">{slot}</div>
      <div id="groupslot">{groupslot}</div>
      <Link href="/parallel-layout/sub/route">/sub/route</Link>
    </div>
  )
}
