import Head from 'next/head'
import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Head>
        <Script
          id="bi-inline-in-page-in-head"
          strategy="beforeInteractive"
        >{`console.log('bi-inline-in-page-in-head')`}</Script>
      </Head>
      <Script
        id="bi-inline-in-page-out-head"
        strategy="beforeInteractive"
      >{`console.log('bi-inline-in-page-out-head')`}</Script>
      <div>page7</div>
    </div>
  )
}

export default Page
