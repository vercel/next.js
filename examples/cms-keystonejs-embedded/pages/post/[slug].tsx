import Link from "next/link";
import { lists } from ".keystone/api";

export default function Home({ post }) {
  return (
    <div>
      <main style={{ margin: "3rem" }}>
        <div>
          <Link href="/">&larr; back home</Link>
        </div>
        <h1>{post.title}</h1>
        <p>{post.content}</p>
      </main>
    </div>
  );
}

export async function getStaticPaths() {
  const posts = await lists.Post.findMany({
    query: `slug`,
  });

  const paths = posts
    .map((post) => post.slug)
    .filter((slug): slug is string => !!slug)
    .map((slug) => `/post/${slug}`);

  return {
    paths,
    fallback: false,
  };
}

export async function getStaticProps({ params: { slug } }) {
  const [post] = await lists.Post.findMany({
    where: { slug },
    query: "id title content",
  });
  return { props: { post } };
}
