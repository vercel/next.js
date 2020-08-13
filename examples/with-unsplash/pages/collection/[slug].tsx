import Head from 'next/head'
import Layout, { siteTitle } from 'components/Layout'
import { GetServerSideProps } from 'next'
import Gallery from 'components/Gallery'
import Collections from 'components/Collections'

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  return {
    props: {
      query: query
    }
  }
}

const Collection = ({ query }) => {

  return (
    <Layout>

      <Head>
        <title>{query.slug.replace(/\-+/g, ' ')} - {siteTitle}</title>
      </Head>

      <Collections id_collection={query.id} />

      <Gallery id_collection={query.id} />

    </Layout>
  )
}

export default Collection