import App from "../components/App";
import InfoBox from "../components/InfoBox";
import Header from "../components/Header";
import Submit from "../components/Submit";
import PostList, {
  ALL_POSTS_QUERY,
  allPostsQueryVars,
} from "../components/PostList";
import { initializeApollo, addApolloState } from "../lib/apolloClient";

const IndexPage = () => (
  <App>
    <Header />
    <InfoBox>ℹ️ This page shows how to use SSG with Apollo.</InfoBox>
    <Submit />
    <PostList />
  </App>
);

export async function getStaticProps() {
  const apolloClient = initializeApollo();

  await apolloClient.query({
    query: ALL_POSTS_QUERY,
    variables: allPostsQueryVars,
  });

  return addApolloState(apolloClient, {
    props: {},
    revalidate: 1,
  });
}

export default IndexPage;
