import Head from 'next/head'
import Link from 'next/link'

const WithFont = () => {
  return (
    <>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
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
