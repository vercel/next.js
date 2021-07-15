import {
  GetStaticPropsContext,
  InferGetStaticPathsType,
  InferGetStaticPropsType,
} from 'next'

type Post = {
  id: string
  title: string
  content: string
}

export const getStaticPaths = async () => {
  return {
    paths: [{ params: { post: '1' } }],
    fallback: false,
  }
}

export const getStaticProps = async (
  ctx: GetStaticPropsContext<InferGetStaticPathsType<typeof getStaticPaths>>
) => {
  const post: Post = {
    id: ctx.params!.post,
    title: 'Hello World',
    content: 'hello world',
  }

  return {
    props: {
      post,
    },
  }
}

function BlogPost({ post }: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </>
  )
}

export default BlogPost
