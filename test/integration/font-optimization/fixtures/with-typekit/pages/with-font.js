import Head from 'next/head'
import Link from 'next/link'

const WithFont = () => {
  return (
    <>
      <Head>
        <link href="https://use.typekit.net/ucs7mcf.css" rel="stylesheet" />
      </Head>

      <div id="with-font-container">
        Page with custom fonts
        <br />
        <br />
        <Link href="/without-font">Without font</Link>
      </div>
    </>
  )
}

export const getServerSideProps = async () => {
  return {
    props: {},
  }
}

export default WithFont
