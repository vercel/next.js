import { useRouter } from "next/router";
import ErrorPage from "next/error";
import Container from "../../components/container";
import MoreStories from "../../components/more-stories";
import PostBody from "../../components/post-body";
import Header from "../../components/header";
import PostHeader from "../../components/post-header";
import SectionSeparator from "../../components/section-separator";
import Layout from "../../components/layout";
import { getAllPostSlugs, getPostAndMorePosts } from "../../lib/api";
import PostTitle from "../../components/post-title";
import Head from "next/head";
import { EXAMPLE_TOOL_NAME } from "../../lib/constants";
import Tags from "../../components/tags";
import Post from "../../types/post";

type Props = {
  post: Post;
  morePosts: Post[];
  preview: boolean;
};

export default function PostDetails({ post, morePosts, preview }: Props) {
  const router = useRouter();

  if (!router.isFallback && !post?.slug) {
    return <ErrorPage statusCode={404} />;
  }

  return (
    <Layout preview={preview}>
      <Container>
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>
              <Head>
                <title>
                  {post.title} | Next.js Blog Example with {EXAMPLE_TOOL_NAME}
                </title>
                <meta property="og:image" content={post.coverImage.url} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.coverImage}
                date={post.date}
                author={post.author}
              />
              <PostBody content={post.content} />
              <footer>
                {post.tags?.length > 0 && <Tags tags={post.tags} />}
              </footer>
            </article>

            <SectionSeparator />
            {morePosts && morePosts.length > 0 && (
              <MoreStories posts={morePosts} />
            )}
          </>
        )}
      </Container>
    </Layout>
  );
}

export async function getStaticPaths({ preview }: { preview: boolean }) {
  const slugs = await getAllPostSlugs(preview);

  return {
    paths: slugs.map((slug) => `/posts${slug}`),
    fallback: false,
  };
}

type Params = {
  slug: string;
};

export async function getStaticProps({
  params,
  preview,
}: {
  params: Params;
  preview: boolean;
}) {
  const postAndMorePosts = await getPostAndMorePosts(params.slug, preview);

  return {
    props: {
      post: postAndMorePosts.post,
      morePosts: postAndMorePosts.morePosts,
      preview: preview || null,
    },
  };
}
