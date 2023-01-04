import Link from 'next/link'

export default function Layout({ children }) {
  return (
    <>
      <header>
        <nav>
          <Link href="/linking">Home</Link>
          <Link href="/linking/about">About</Link>
        </nav>
      </header>
      {children}
    </>
  )
}
