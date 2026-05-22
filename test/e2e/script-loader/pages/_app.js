import Script from 'next/script'

import '../styles/styles.css'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Script
        id="documentAfterInteractive"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=documentAfterInteractive"
        strategy="afterInteractive"
      />
      <Script
        id="documentLazyOnload"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=documentLazyOnload"
        strategy="lazyOnload"
      />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
