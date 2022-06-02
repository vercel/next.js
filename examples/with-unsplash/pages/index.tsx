import Head from 'next/head'
import Layout, { siteTitle } from 'components/Layout'
import Gallery from 'components/Gallery'
import Stats from 'components/Stats'
import Collections from 'components/Collections'

const Home = () => {
  return (
    <Layout>
      <Head>
        <title>{siteTitle}</title>
      </Head>

      <Stats />

      <Collections />

      <Gallery />
    </Layout>
  )
}

export default Home
