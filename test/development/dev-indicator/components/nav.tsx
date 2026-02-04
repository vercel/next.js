import Link from 'next/link'

export function Nav() {
  return (
    <nav>
      <p>
        <Link href="/app/static-indicator/dynamic">App Router Dynamic</Link>
      </p>
      <p>
        <Link href="/app/static-indicator/static">App Router Static</Link>
      </p>
      <p>
        <Link href="/pages">Pages Router Static</Link>
      </p>
      <p>
        <Link href="/pages/gssp">Pages Router getServerSideProps</Link>
      </p>
      <p>
        <Link href="/pages/pregenerated">Pages Router getStaticPaths</Link>
      </p>
      <p>
        <Link href="/pages/gip">Pages Router getInitialProps</Link>
      </p>
    </nav>
  )
}
