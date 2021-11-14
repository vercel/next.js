import React from 'react'
import { dehydrate, QueryClient } from 'react-query'
import { Layout, Header, InfoBox, PostList } from '../components'
import { fetchPosts } from '../hooks'

const Home = () => {
  return (
    <Layout>
      <Header />
      <InfoBox>ℹ️ This page shows how to use SSG with React-Query.</InfoBox>
      <PostList />
    </Layout>
  )
}

export async function getStaticProps() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery(['posts', 10], () => fetchPosts(10))

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  }
}

export default Home
