import App from '../components/App';
import InfoBox from '../components/InfoBox';
import PostList from '../components/PostList';

const IndexPage = () => {
  return (
    <App>
      <InfoBox>ℹ️ This page shows how to use SSR with Apollo's getDataFromTree().</InfoBox>
      <p>On SSR fetch data from inside your components by only using useQuery and no need to prefetch data in getInitialProps</p>
      <p>This example uses a cache control object so you can have multiple cache instances usefull for when you have multiple apollo clients in your app.</p>
      <p>SSR your data from anywhere in your app!</p>
      <br />
      <p>This list is server side rendered:</p>
      <PostList />
    </App>
  )
}

export default IndexPage
