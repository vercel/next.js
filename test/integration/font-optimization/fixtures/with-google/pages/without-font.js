import Head from 'next/head'
import Link from 'next/link'

const WithoutFont = () => {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div>
        Page without custom fonts
        <br />
        <br />
        <Link href="/with-font">With font</Link>
      </div>
    </>
  )
}

export const getServerSideProps = async () => {
  return {
    props: {},
  }
}

export default WithoutFont
