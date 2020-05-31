import App from '../components/App'
import InfoBox from '../components/InfoBox'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import renderWithApollo from '../lib/renderWithApollo'

const IndexPage = () => (
  <App>
    <Header pathname="/" />
    <InfoBox>
      ℹ️ This example shows how to use SSG with Apollo provider.
    </InfoBox>
    <Submit />
    <PostList />
  </App>
)

export async function getStaticProps() {
  await renderWithApollo(IndexPage)
  return { props: {} }
}

export default IndexPage
