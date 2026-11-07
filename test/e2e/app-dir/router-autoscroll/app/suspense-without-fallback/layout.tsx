import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex' }}>
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          height: 10000,
        }}
      >
        <Link id="to-suspended-page" href="/suspense-without-fallback/slow">
          Slow page
        </Link>
      </nav>
      <main>{children}</main>
    </div>
  )
}
