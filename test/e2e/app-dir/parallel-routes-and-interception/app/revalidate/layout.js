import Link from 'next/link'

export default function Layout({ children, slot }) {
  return (
    <div>
      <div
        id="layout"
        style={{
          border: '1px solid green',
        }}
      >
        layout
        <div
          id="slot"
          style={{
            border: '1px solid red',
          }}
        >
          {slot}
        </div>
        <Link href="/revalidate/sub">to sub</Link>
        {children}
      </div>
    </div>
  )
}
