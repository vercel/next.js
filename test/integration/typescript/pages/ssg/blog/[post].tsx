import {
  InferGetStaticPropsType,
  GetStaticPaths,
  GetStaticPropsContext,
} from 'next'

type Post = {
  author: string
  content: string
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{ params: { post: '1' } }],
    fallback: false,
  }
}

export const getStaticProps = async (
  ctx: GetStaticPropsContext<{ post: string }>
) => {
  const posts: Post[] = [
    {
      author: 'Vercel',
      content: 'hello wolrd',
    },
  ]

  return {
    props: {
      posts,
    },
  }
}

function Blog({ posts }: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      {posts.map((post) => (
        <div key={post.author}>{post.author}</div>
      ))}
    </>
  )
}

export default Blog
