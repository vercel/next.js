import Head from 'next/head'
import { useRouter } from 'next/router'

export async function getStaticProps() {
  const posts = await fetch('https://jsonplaceholder.typicode.com/posts').then(
    (res) => res.json()
  )

  return {
    props: {
      posts,
    },
    revalidate: 60, // ISR with 60 second revalidation
  }
}

export default function BlogIndex({ posts }) {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>Blog - My Blog</title>
        <meta name="description" content="All blog posts" />
      </Head>

      <div>
        <h1>All Blog Posts</h1>

        <div className="posts-grid">
          {posts.map((post) => (
            <div key={post.id} className="post-card">
              <h2>
                <a href={`/blog/${post.id}`}>{post.title}</a>
              </h2>
              <p>{post.body.substring(0, 100)}...</p>
              <button onClick={() => router.push(`/blog/${post.id}`)}>
                Read More
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
