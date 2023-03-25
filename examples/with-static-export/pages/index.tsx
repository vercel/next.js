import Head from 'next/head'
import { GetStaticProps, NextPage } from 'next'
import Post from '../components/post'
import { GetPosts } from '../lib/postdata_api'
import { type PostData } from '../@types/global'

export const getStaticProps: GetStaticProps = async () => {
  // fetch list of posts
  const posts = await GetPosts()
  return {
    props: {
      posts,
    },
  }
}

const IndexPage: NextPage<{ posts: PostData[] }> = ({
  posts,
}) => {
  return (
    <main>
      <Head>
        <title>Home page</title>
      </Head>

      <h1>List of posts</h1>

      <section>
        {posts.map((post) => (
          <Post {...post} key={post.id} />
        ))}
      </section>
    </main>
  )
}

export default IndexPage
