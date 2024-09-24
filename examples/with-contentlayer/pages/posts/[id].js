import Head from "next/head";
import { allPosts } from "contentlayer/generated";
import utilStyles from "../../styles/utils.module.css";

export default function Post({ post }) {
  return (
    <>
      <Head>
        <title>{post.title}</title>
      </Head>

      <article>
        <h1 className={utilStyles.headingXl}>{post.title}</h1>
        <div className={utilStyles.lightText}>{post.date}</div>

        <div dangerouslySetInnerHTML={{ __html: post.body.html }} />
      </article>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: allPosts.map((p) => ({ params: { id: p.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const post = allPosts.find((post) => post.slug === params?.id);

  return { props: { post } };
}
