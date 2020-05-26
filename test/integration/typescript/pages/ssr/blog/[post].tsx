import { ServerSideProps } from 'next'

type Post = {
  author: string
  content: string
}

export const getServerSideProps = async () => {
  const res = await fetch(`https://.../posts/`)
  const posts: Post[] = await res.json()
  return {
    props: {
      posts,
    },
  }
}

function Blog({ posts }: ServerSideProps<typeof getServerSideProps>) {
  return (
    <>
      {posts.map((post) => (
        <div key={post.author}>{post.author}</div>
      ))}
    </>
  )
}

export default Blog
