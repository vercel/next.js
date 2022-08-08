import Link from 'next/link'

import '../styles/global.css'

const MyApp = ({ Component, pageProps, router }) => {
  const pathname = router.pathname

  return (
    <>
      <Component {...pageProps} />
      {pathname !== '/' && (
        <Link href="/">
          <a>See all examples</a>
        </Link>
      )}
    </>
  )
}

export default MyApp
