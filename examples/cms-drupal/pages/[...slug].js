import { useRouter } from "next/router";
import ErrorPage from "next/error";
import Head from "next/head";
import {
  getPathsFromContext,
  getResourceCollectionFromContext,
  getResourceFromContext,
} from "next-drupal";

import Container from "../components/container";
import PostBody from "../components/post-body";
import MoreStories from "../components/more-stories";
import Header from "../components/header";
import PostHeader from "../components/post-header";
import SectionSeparator from "../components/section-separator";
import Layout from "../components/layout";
import PostTitle from "../components/post-title";

import { CMS_NAME } from "../lib/constants";
import { absoluteURL } from "../lib/api";

export default function Post({ post, morePosts, preview }) {
  const router = useRouter();
  if (!router.isFallback && !post?.id) {
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
                  content={absoluteURL(post.field_image.uri.url)}
                />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={{
                  sourceUrl: absoluteURL(post.field_image.uri.url),
                }}
                date={post.created}
                author={{
                  name: post.uid.field_name,
                  avatar: {
                    url: absoluteURL(post.uid.user_picture.uri.url),
                  },
                }}
              />
              <PostBody content={post.body.processed} />
            </article>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  );
}

export async function getStaticProps(context) {
  const post = await getResourceFromContext("node--article", context, {
    params: {
      include: "field_image,uid,uid.user_picture",
    },
  });

  let morePosts = [];
  if (post) {
    morePosts = await getResourceCollectionFromContext(
      "node--article",
      context,
      {
        params: {
          include: "field_image,uid,uid.user_picture",
          sort: "-created",
          "filter[id][condition][path]": "id",
          "filter[id][condition][operator]": "<>",
          "filter[id][condition][value]": post.id,
        },
      },
    );
  }

  return {
    props: {
      preview: context.preview || false,
      post,
      morePosts,
    },
  };
}

export async function getStaticPaths(context) {
  return {
    paths: await getPathsFromContext("node--article", context),
    fallback: true,
  };
}
