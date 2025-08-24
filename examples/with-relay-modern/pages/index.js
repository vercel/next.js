import Link from "next/link";
import { fetchQuery } from "react-relay";
import { initEnvironment } from "../lib/relay";
import BlogPosts from "../components/BlogPosts";
import indexPageQuery from "../queries/indexPage";

const Index = ({ viewer }) => (
  <div>
    <Link href="/about">About</Link>
    <BlogPosts viewer={viewer} />
  </div>
);

export async function getStaticProps() {
  const environment = initEnvironment();
  const queryProps = await fetchQuery(environment, indexPageQuery);
  const initialRecords = environment.getStore().getSource().toJSON();

  return {
    props: {
      ...queryProps,
      initialRecords,
    },
  };
}

export default Index;
