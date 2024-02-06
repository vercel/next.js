import Container from "../components/container";
import MoreStories from "../components/more-stories";
import HeroPost from "../components/hero-post";
import Intro from "../components/intro";
import Layout from "../components/layout";
import { getAllPosts } from "../lib/api";
import Head from "next/head";
import { CMS_NAME } from "../lib/constants";
import { Post } from "@/viewmodels/post";

type IndexProps = {
  allPosts: Array<Post>;
  preview: boolean;
};

export default function Index({ allPosts, preview }: IndexProps) {
  const heroPost = allPosts[0];
  const morePosts = allPosts.slice(1);
  return (
    <>
      <Layout preview={preview}>
        <Head>
          <title>{`Next.js Blog Example with ${CMS_NAME}`}</title>
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
          <>{morePosts.length > 0 && <MoreStories posts={morePosts} />}</>
        </Container>
      </Layout>
    </>
  );
}

export async function getStaticProps({ preview = false }) {
  const allPosts = await getAllPosts(preview);
  return {
    props: { allPosts, preview },
  };
}
