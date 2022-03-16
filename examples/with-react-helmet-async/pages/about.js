import { Helmet } from 'react-helmet-async'
import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <Helmet>
        <title>About</title>
        <meta name="description" content="about" />
        <link rel="icon" href="/favicon.ico" />
      </Helmet>
      <h1>About</h1>
      <>
        <style jsx>{`
          a:hover {
            text-decoration: underline;
            color: #0070f3;
          }
        `}</style>
        <Link href="/">
          <a>Home</a>
        </Link>
      </>
    </div>
  )
}
