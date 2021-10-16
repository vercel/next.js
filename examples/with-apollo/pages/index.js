import App from '../components/App'
import ErrorMessage from '../components/ErrorMessage'
import InfoBox from '../components/InfoBox'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList, {
  ALL_POSTS_QUERY,
  allPostsQueryVars,
} from '../components/PostList'
import { initializeApollo, addApolloState } from '../lib/apolloClient'

const IndexPage = ({ errorMessage, errors }) => (
  <App>
    <Header />
    <InfoBox>ℹ️ This page shows how to use SSG with Apollo.</InfoBox>
    <Submit />
    
    {!errorMessage && !errors && <PostList />}
    {errors?.map(err=> <ErrorMessage message={err.message} />)}
  </App>
)

export async function getStaticProps() {
  const apolloClient = initializeApollo()

  try {
    await apolloClient.query({
      query: ALL_POSTS_QUERY,
      variables: allPostsQueryVars,
    })
  
    return addApolloState(apolloClient, {
      props: {},
      revalidate: 1,
    })
  } catch (error) {
    const errorMessage = error.message;
    const errors = error.networkError?.result?.errors
    
    return addApolloState(apolloClient, {
      props: {
        errorMessage,
        errors
      },
      revalidate: 1,
    }) 
  }
}

export default IndexPage
