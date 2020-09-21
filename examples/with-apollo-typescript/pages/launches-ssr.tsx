import React from 'react'
import { GetStaticProps } from 'next'
import { LaunchesDocument } from '@Generated'
import { MainLayout } from '@Components/MainLayout'
import { Launches } from '@Components'

import { initializeApollo } from '@lib/Apollo'

const LaunchesSSR = (): JSX.Element => {
  return (
    <MainLayout>
      <Launches />
    </MainLayout>
  )
}

export const getStaticProps: GetStaticProps = async () => {
  const apolloClient = initializeApollo()

  await apolloClient.query({
    query: LaunchesDocument,
  })

  return {
    props: {
      initialApolloState: apolloClient.cache.extract(),
    },
    revalidate: 1,
  }
}

export default LaunchesSSR
