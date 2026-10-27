import Link from 'next/link'

export default function MarketingLayout({
  children,
}: LayoutProps<'/(marketing)'>) {
  return (
    <>
      <header>
        <nav aria-label="Marketing">
          <Link href="/">Relay</Link>
          {' · '}
          <Link href="/pricing">Pricing</Link>
          {' · '}
          <Link href="/docs/getting-started/install">Docs</Link>
          {' · '}
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>
      {children}
      <footer>
        <p>© Relay</p>
      </footer>
    </>
  )
}
