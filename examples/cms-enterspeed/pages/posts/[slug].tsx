import { useRouter } from "next/router";
import ErrorPage from "next/error";
import Container from "../../components/container";
import PostBody from "../../components/post-body";
import Header from "../../components/header";
import PostHeader from "../../components/post-header";
import SectionSeparator from "../../components/section-separator";
import Layout from "../../components/layout";
import { getByUrl, getByHandle } from "../../lib/api";
import PostTitle from "../../components/post-title";
import Head from "next/head";
import { EXAMPLE_TOOL_NAME } from "../../lib/constants";
import Tags from "../../components/tags";
import PostType from "../../types/postType";

type Props = {
  post: PostType;
  preview: boolean;
};

export default function Post({ post, preview }: Props) {
  const router = useRouter();

  if (!router.isFallback && !post?.url) {
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
                <meta property="og:image" content={post.featuredImage} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.featuredImage}
                date={post.date}
                author={post.author}
                categories={post.categories}
              />
              <PostBody content={post.content} />
              <footer>
                {post.tags?.length > 0 && <Tags tags={post.tags} />}
              </footer>
            </article>

            <SectionSeparator />
          </>
        )}
      </Container>
    </Layout>
  );
}

export async function getStaticPaths({ preview }: { preview: boolean }) {
  const data = await getByHandle("blogList", preview);

  return {
    paths: data.blogListItems.map((post) => ({
      // Remove starting and ending slash from url
      params: { slug: post.url.replace(/^\/|\/$/g, "") },
    })),
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
  // Adding starting slash to the URL again
  const data = await getByUrl(encodeURIComponent(`/${params.slug}`), preview);

  return {
    props: {
      post: data,
      preview: preview || null,
    },
  };
}
