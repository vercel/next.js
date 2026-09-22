import Head from 'next/head'
import { getPosts, getPost, getComments } from '../../lib/posts'
import { useRouter } from 'next/router'

export async function getStaticPaths() {
  const posts = await getPosts()

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
      getPost(params.id),
      getComments(params.id),
    ])
    if (!post) {
      return { notFound: true }
    }

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
