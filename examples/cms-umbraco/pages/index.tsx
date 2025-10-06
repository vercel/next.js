import Head from "next/head";
import Container from "../components/container";
import MoreStories from "../components/more-stories";
import HeroPost from "../components/hero-post";
import Intro from "../components/intro";
import Layout from "../components/layout";
import { EXAMPLE_TOOL_NAME } from "../lib/constants";
import Post from "../types/post";
import { getAllPostsForHome } from "../lib/api";

type Props = {
  posts: Post[];
  preview: boolean;
};

export default function Index({ posts, preview }: Props) {
  const heroPost = posts[0];
  const morePosts = posts.slice(1);

  return (
    <>
      <Layout preview={preview}>
        <Head>
          <title>Next.js Blog Example with {EXAMPLE_TOOL_NAME}</title>
        </Head>
        <Container>
          <Intro />
          {heroPost && (
            <HeroPost
              title={heroPost.title}
              coverImage={heroPost.coverImage}
              date={heroPost.date}
              author={heroPost.author}
              slug={heroPost.slug}
              excerpt={heroPost.excerpt}
            />
          )}
          {morePosts.length > 0 && <MoreStories posts={morePosts} />}
        </Container>
      </Layout>
    </>
  );
}

export async function getStaticProps({ preview }: { preview: boolean }) {
  const posts = await getAllPostsForHome(preview);

  return {
    props: {
      posts: posts,
      preview: preview || null,
    },
  };
}
