import Head from 'next/head'
import { useRouter } from 'next/router'
import { gql, useQuery } from '@apollo/client'

import { initializeApollo, addApolloState } from '../../lib/apolloClient'

export async function getStaticPaths() {
  const apolloClient = initializeApollo()

  const posts = await apolloClient.query({
    query: POST_ALL_QUERY,
  })

  const paths = posts.data.allPosts.map((post) => ({
    params: { id: post.id },
  }))

  console.log(paths.length)

  return { paths, fallback: true }
}

export async function getStaticProps({ params }) {
  const apolloClient = initializeApollo()

  const data = await apolloClient.query({
    query: POST_QUERY,
    variables: { id: params.id },
  })

  return addApolloState(apolloClient, {
    props: {},
    revalidate: 1,
  })
}

export default function Post({ date, ast }) {
  const { query } = useRouter()

  const { data } = useQuery(POST_QUERY, {
    variables: { id: query.id },
  })

  return (
    <div>
      <Head>
        <title>{data?.Post?.title}</title>
      </Head>
      <main>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </main>
    </div>
  )
}

const POST_QUERY = gql`
  query post($id: String!) {
    Post(id: $id) {
      id
      title
      votes
      url
      createdAt
    }
  }
`

const POST_ALL_QUERY = gql`
  query allPosts {
    allPosts {
      id
    }
  }
`
