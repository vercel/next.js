import Head from 'next/head'
import Link from 'next/link'
import styles from '../styles/Home.module.css'

// Import the generated Lists API from Keystone
import { lists } from '.keystone/api'

// Home receives a `posts` prop from `getStaticProps` below
export default function Home({ posts }) {
  return (
    <div className={styles.container}>
      <Head>
        <title>Embedded KeystoneJS example</title>
        <meta
          name="description"
          content="A fully embedded KeystoneJS instance within a Next.js app"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>
          Embedded <a href="https://keystonejs.com">KeystoneJS</a> example
        </h1>
        <ul className={styles.grid}>
          {posts.length ? (
            /* Render each post with a link to the content page */
            posts.map((post) => (
              <li key={post.id} className={styles.card}>
                <Link href={`/post/${post.slug}`}>
                  <h2>{post.title}</h2>
                  <p>Read now &rarr;</p>
                </Link>
              </li>
            ))
          ) : (
            <li className={`${styles.noposts} ${styles.card}`}>
              <Link href="http://localhost:8000">
                <h2>No Posts</h2>
                <p>Add one via the Admin UI &rarr;</p>
              </Link>
            </li>
          )}
        </ul>
        {process.env.NODE_ENV !== 'production' && (
          <Link
            href="/api/graphql?query=%7BallPosts%7Btitle%2Cslug%2Ccontent%7D%7D"
            className={styles.playground}
          >
            Visit the graphql playground
          </Link>
        )}
      </main>
    </div>
  )
}

// Here we use the Lists API to load all the posts we want to display
// The return of this function is provided to the `Home` component
export async function getStaticProps() {
  const posts = await lists.Post.findMany({ query: 'id title slug' })
  return { props: { posts } }
}
