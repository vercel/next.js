import App from '../components/App'
import InfoBox from '../components/InfoBox'
import Header from '../components/Header'
import SubscriptionSubmit from '../components/SubscriptionSubmit'
import SubscriptionList from '../components/SubscriptionList'
import { withApollo } from '../lib/apollo'
import { useQuery } from '@apollo/react-hooks'
import gql from 'graphql-tag'

export const ALL_POSTS_QUERY = gql`
  query allPosts($first: Int!, $skip: Int!) {
    allPosts(orderBy: createdAt_DESC, first: $first, skip: $skip) {
      id
      title
      votes
      url
      createdAt
    }
  }
`
const POST_SUBSCRIPTION = gql`
  subscription {
    Post {
      node {
        id
        title
        votes
        url
        createdAt
      }
    }
  }
`

export const allPostsQueryVars = {
  skip: 0,
  first: 10
}

const handleSubscribe = subscribeToMore => {
  subscribeToMore({
    document: POST_SUBSCRIPTION,

    updateQuery: (prev, { subscriptionData }) => {
      if (!subscriptionData.data) return prev
      const newPost = subscriptionData.data.Post.node
      return {
        allPosts: [newPost, ...prev.allPosts]
      }
    }
  })
}

const Subscription = () => {
  const { subscribeToMore, ...result } = useQuery(ALL_POSTS_QUERY, {
    variables: allPostsQueryVars,
    // Setting this value to true will make the component rerender when
    // the 'networkStatus' changes, so we are able to know if it is fetching
    // more data
    notifyOnNetworkStatusChange: true
  })

  return (
    <App>
      <Header />
      <InfoBox>
        ℹ️ This is a working example of apollo subscriptions with nextjs. If you
        submit a new url, all clients currently on this page will get the update
        not just you. To see it in action, open up two browsers and create a
        link in one, you'd notice the other one gets the update instantly. This
        sends all our request in the client because subscriptions don't work on
        the server.
      </InfoBox>
      <SubscriptionSubmit />
      <SubscriptionList
        {...result}
        handleSubscribe={() => handleSubscribe(subscribeToMore)}
      />
    </App>
  )
}

export default withApollo({ ssr: true })(Subscription)
