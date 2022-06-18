import Script from 'next/script'
import Link from 'next/link'
import Head from 'next/head'

const Page = () => {
  return (
    <div class="container">
      <Head>
        <Script
          id="script-bi-inline-in-page-in-head"
          strategy="beforeInteractive"
        >{`console.log('script-bi-inline-in-page-in-head')`}</Script>
        <Script
          id="script-ai-inline-in-page-in-head"
          strategy="afterInteractive"
        >{`console.log('script-ai-inline-in-page-in-head')`}</Script>
        <Script
          id="script-lo-inline-in-page-in-head"
          strategy="lazyOnload"
        >{`console.log('script-lo-inline-in-page-in-head')`}</Script>
        {/* <Script
          id="script-w-inline-in-page-in-head"
          strategy="worker"
        >{`console.log('script-w-inline-in-page-in-head')`}</Script> */}
      </Head>
      <Script
        id="script-bi-inline-in-page-out-head"
        strategy="beforeInteractive"
      >{`console.log('script-bi-inline-in-page-out-head')`}</Script>
      <Script
        id="script-ai-inline-in-page-out-head"
        strategy="afterInteractive"
      >{`console.log('script-ai-inline-in-page-out-head')`}</Script>
      <Script
        id="script-lo-inline-in-page-out-head"
        strategy="lazyOnload"
      >{`console.log('script-lo-inline-in-page-out-head')`}</Script>
      {/* <Script
        id="script-w-inline-in-page-out-head"
        strategy="worker"
      >{`console.log('script-w-inline-in-page-out-head')`}</Script> */}

      <Script
        id="scriptAfterInteractive"
        src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js?a=scriptAfterInteractive"
      ></Script>
      <div>index</div>
      <div>
        <Link href="/page1">Page1</Link>
      </div>
      <div>
        <Link href="/page5">Page5</Link>
      </div>
    </div>
  )
}

export default Page
