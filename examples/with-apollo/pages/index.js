import App from '../components/App'
import InfoBox from '../components/InfoBox'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import getApolloState from '../lib/getApolloState'

const IndexPage = () => (
  <App>
    <Header pathname="/" />
    <InfoBox>ℹ️ This page shows how to use SSG with Apollo.</InfoBox>
    <Submit />
    <PostList />
  </App>
)

export async function getStaticProps() {
  const initialApolloState = await getApolloState(IndexPage)
  return { props: { initialApolloState } }
}

export default IndexPage
