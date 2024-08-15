import Link from 'next/link'

export default function Layout({ children }) {
  return (
    <>
      <header>
        <nav>
          <Link href="/linking" id="home">
            Home
          </Link>
          <Link href="/linking/about" id="about">
            About
          </Link>
          <Link href="/dashboard/deployments/breakdown" id="breakdown">
            /dashboard/deployments/breakdown
          </Link>
          <Link href="/dashboard/deployments/123" id="deployments">
            /dashboard/deployments/123
          </Link>
        </nav>
      </header>
      {children}
    </>
  )
}
