import { useQuery } from '@apollo/react-hooks'
import { NextPage } from 'next'
import { motion } from 'framer-motion'

import Layout from 'components/Layout'
import Card from 'components/Card'
import Loader from 'components/Loader'

import { initializeApollo } from 'lib/apolloClient'
import { CATEGORY_LIST_QUERY } from 'lib/graphql/category'

import { IProduct } from 'interfaces/product'

const container = {
  hidden: { opacity: 1, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      delay: 0.3,
      when: 'beforeChildren',
      staggerChildren: 0.1,
    },
  },
}

const IndexPage: NextPage = () => {
  const { loading, error, data } = useQuery(CATEGORY_LIST_QUERY, {
    variables: { eq: 'shop-now' },
    notifyOnNetworkStatusChange: true,
  })

  let products = data.categoryList[0].products.items

  if (error) {
    return <h6>{error.graphQLErrors[0].message}</h6>
  }

  return (
    <Layout title="Home">
      {loading ? (
        <Loader loading={loading} />
      ) : (
        <motion.div
          className="container"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          <div className="row">
            {products.map((product: IProduct) => (
              <Card key={product.id} {...product} />
            ))}
          </div>
        </motion.div>
      )}
    </Layout>
  )
}

export async function getStaticProps() {
  const apolloClient = initializeApollo()

  await apolloClient.query({
    query: CATEGORY_LIST_QUERY,
    // URL OF THE CATEGORY
    variables: { eq: 'CATEGORY-URL' },
  })

  return {
    props: {
      initialApolloState: apolloClient.cache.extract(),
    },
    unstable_revalidate: 1,
  }
}

export default IndexPage
