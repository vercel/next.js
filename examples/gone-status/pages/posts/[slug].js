// Pages Router post page
import Head from "next/head";
import { useRouter } from "next/router";

// List of deleted posts
const DELETED_POSTS = ["deleted"];

// List of known posts
const KNOWN_POSTS = ["active", "deleted"];

export default function Post({ slug }) {
  const router = useRouter();

  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Post: {slug}</title>
      </Head>

      <div className="post-container">
        <h1>Post: {slug}</h1>
        <p>This is an active post that exists in the Pages Router.</p>
        <a href="/">Return to home</a>

        <style jsx>{`
          .post-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
          }

          h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
          }

          a {
            display: inline-block;
            margin-top: 2rem;
            color: #0070f3;
            text-decoration: none;
          }

          a:hover {
            text-decoration: underline;
          }
        `}</style>
      </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  const { slug } = params;

  // Check if post is deleted
  if (DELETED_POSTS.includes(slug)) {
    // Return 410 Gone for deleted content
    return {
      gone: true,
    };
  }

  // Check if post exists
  if (!KNOWN_POSTS.includes(slug)) {
    // Return 404 Not Found for unknown content
    return {
      notFound: true,
    };
  }

  // Return props for active post
  return {
    props: {
      slug,
    },
  };
}
