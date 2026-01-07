import { useRouter } from "next/router";
import ErrorPage from "next/error";
import Container from "@/components/container";
import PostBody from "@/components/post-body";
import MoreStories from "@/components/more-stories";
import Header from "@/components/header";
import PostHeader from "@/components/post-header";
import SectionSeparator from "@/components/section-separator";
import Layout from "@/components/layout";
import { getAllPostsWithSlug, getPostAndMorePosts } from "@/lib/api";
import PostTitle from "@/components/post-title";
import Head from "next/head";
import { CMS_NAME } from "@/lib/constants";
import markdownToHtml from "@/lib/markdownToHtml";
import { PostType } from "interfaces";
import { ParsedUrlQueryInput } from "querystring";

type PostProps = {
  post: PostType;
  morePosts: PostType[];
  preview;
};

const Post = (props: PostProps) => {
  const { post, morePosts, preview } = props;
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
                  {`${post.title} | Next.js Blog Example with ${CMS_NAME}`}
                </title>
                <meta
                  property="og:image"
                  content={post.metadata.cover_image.imgix_url}
                />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.metadata.cover_image}
                date={post.created_at}
                author={post.metadata.author}
              />
              <PostBody content={post.content} />
            </article>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  );
};
export default Post;

type staticProps = {
  params: ParsedUrlQueryInput;
  preview: boolean;
};

export const getStaticProps = async (props: staticProps) => {
  const { params, preview = null } = props;
  try {
    const data = await getPostAndMorePosts(params.slug as string, preview);
    const content = await markdownToHtml(data["post"]?.metadata?.content || "");
    return {
      props: {
        preview,
        post: {
          ...data["post"],
          content,
        },
        morePosts: data["morePosts"] || [],
      },
    };
  } catch (err) {
    return <ErrorPage statusCode={err.status} />;
  }
};

export async function getStaticPaths() {
  const allPosts = (await getAllPostsWithSlug()) || [];
  return {
    paths: allPosts.map((post) => `/posts/${post.slug}`),
    fallback: true,
  };
}
