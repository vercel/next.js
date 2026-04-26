import Head from 'next/head'
import { useRouter } from 'next/router'

export async function getStaticPaths() {
  const posts = await fetch('https://jsonplaceholder.typicode.com/posts').then(
    (res) => res.json()
  )

  const paths = posts.slice(0, 10).map((post) => ({
    params: { id: post.id.toString() },
  }))

  return {
    paths,
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  try {
    const [post, comments] = await Promise.all([
      fetch(`https://jsonplaceholder.typicode.com/posts/${params.id}`).then(
        (res) => res.json()
      ),
      fetch(
        `https://jsonplaceholder.typicode.com/posts/${params.id}/comments`
      ).then((res) => res.json()),
    ])

    return {
      props: {
        post,
        comments,
      },
      revalidate: 300, // 5 minutes
    }
  } catch (error) {
    return {
      notFound: true,
    }
  }
}

export default function BlogPost({ post, comments }) {
  const router = useRouter()

  if (router.isFallback) {
    return <div>Loading...</div>
  }

  return (
    <>
      <Head>
        <title>{post.title} - My Blog</title>
        <meta name="description" content={post.body.substring(0, 160)} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.body.substring(0, 160)} />
      </Head>

      <article>
        <button onClick={() => router.back()}>← Back</button>

        <h1>{post.title}</h1>
        <p>{post.body}</p>

        <h2>Comments ({comments.length})</h2>
        <div className="comments">
          {comments.map((comment) => (
            <div key={comment.id} className="comment">
              <h3>{comment.name}</h3>
              <p>{comment.body}</p>
              <small>By: {comment.email}</small>
            </div>
          ))}
        </div>
      </article>
    </>
  )
}
