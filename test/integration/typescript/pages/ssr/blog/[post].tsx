import { InferGetServerSidePropsType, GetServerSidePropsContext } from 'next'

type Post = {
  author: string
  content: string
}

export const getServerSideProps = async (
  ctx: GetServerSidePropsContext<{ post: string }>
) => {
  const res = await fetch(`https://.../posts/`)
  const posts: Post[] = await res.json()
  return {
    props: {
      posts,
    },
  }
}

function Blog({
  posts,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      {posts.map((post) => (
        <div key={post.author}>{post.author}</div>
      ))}
    </>
  )
}

export default Blog
