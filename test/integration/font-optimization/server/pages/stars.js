import Head from '../integration/font-optimization/server/pages/next/head'

function Home({ stars }) {
  return (
    <div className="container">
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@700"
          rel="stylesheet"
        ></link>
      </Head>

      <main>
        <div>Next stars: {stars}</div>
      </main>
    </div>
  )
}

Home.getInitialProps = async () => {
  return { stars: Math.random() * 1000 }
}

export default Home
