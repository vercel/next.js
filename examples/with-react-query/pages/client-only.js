import React from 'react'
import { Layout, Header, InfoBox, PostList } from '../components'

const ClientOnly = () => {
  return (
    <Layout>
      <Header />
      <InfoBox>ℹ️ This data is loaded on client and not prefetched</InfoBox>
      <PostList />
    </Layout>
  )
}

export default ClientOnly
