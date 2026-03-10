import Head from 'next/head'
import { useRouter } from 'next/router'

export async function getServerSideProps({ req }) {
  const userAgent = req.headers['user-agent'] || ''
  const posts = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_limit=5'
  ).then((res) => res.json())

  return {
    props: {
      posts,
      userAgent,
      timestamp: new Date().toISOString(),
    },
  }
}

export default function HomePage({ posts, userAgent, timestamp }) {
  const router = useRouter()

  const navigateToBlog = () => {
    router.push('/blog')
  }

  return (
    <>
      <Head>
        <title>Home - My Blog</title>
        <meta name="description" content="Welcome to my blog homepage" />
        <meta property="og:title" content="Home - My Blog" />
      </Head>

      <div>
        <h1>Welcome to My Blog</h1>
        <p>Server-side rendered at: {timestamp}</p>
        <p>Your user agent: {userAgent}</p>

        <h2>Recent Posts</h2>
        <ul>
          {posts.map((post) => (
            <li key={post.id}>
              <a href={`/blog/${post.id}`}>{post.title}</a>
            </li>
          ))}
        </ul>

        <button onClick={navigateToBlog}>View All Posts</button>
      </div>
    </>
  )
}
