import Link from 'next/link'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <header>
        <nav>
          <Link href="/">Home</Link>|<Link href="/about">About</Link>|
          <Link href="/contact">Contact</Link>
        </nav>
      </header>

      <Component {...pageProps} />

      <footer>I`m here to stay</footer>
    </>
  )
}

export default MyApp
