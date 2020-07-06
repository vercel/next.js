import { useQuery } from '@apollo/react-hooks'
import { NextPage, GetServerSideProps } from 'next'
import nextCookie from 'next-cookies'
import cookie from 'js-cookie'
import FadeIn from 'react-fade-in'

import Layout from 'components/Layout'
import Loader from 'components/Loader'
import Profile from 'components/Account/Profile'

import { initializeApollo } from 'lib/apolloClient'
import { GET_CUSTOMER_INFO_QUERY } from 'lib/graphql/account'

const ProfilePage: NextPage = () => {
  const token = cookie.get('token')

  const { loading, error, data } = useQuery(GET_CUSTOMER_INFO_QUERY, {
    context: {
      headers: {
        authorization: token ? `Bearer ${token}` : '',
      },
    },
    notifyOnNetworkStatusChange: true,
  })

  if (loading) {
    return <Loader loading={loading} />
  }

  if (error) {
    return <h6>{error.graphQLErrors[0].message}</h6>
  }

  return (
    <Layout title="Profile">
      {loading ? (
        <Loader loading={loading} />
      ) : (
        <FadeIn>
          <Profile {...data.customer} />
        </FadeIn>
      )}
    </Layout>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const apolloClient = initializeApollo()

  const { token } = nextCookie(context)

  try {
    await apolloClient.query({
      query: GET_CUSTOMER_INFO_QUERY,
      context: {
        headers: {
          authorization: token ? `Bearer ${token}` : '',
        },
      },
    })
  } catch (error) {
    context.res.writeHead(302, { Location: '/account/login' })
    context.res.end()
  }

  return {
    props: {
      initialApolloState: apolloClient.cache.extract(),
    },
  }
}

export default ProfilePage
