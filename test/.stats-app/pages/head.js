import Head from 'next/head'

const Page = () => (
  <>
    <Head>
      <title>hello world</title>
    </Head>

    <p>testing next/head size</p>
  </>
)

// we add getServerSideProps to prevent static optimization
// to allow us to compare server-side changes
export const getServerSideProps = () => {
  return {
    props: {},
  }
}

export default Page
