import { useHydrate } from 'next-mdx/client'
import { getMdxNode, getMdxPaths } from 'next-mdx/server'
import Comment from '../../components/comment'
import Container from '../../components/container'
import distanceToNow from '../../lib/dateRelative'

function PostPage({ post }) {
  const content = useHydrate(post)

  return (
    <Container>
      <article>
        <header>
          <h1 className="text-4xl font-bold">{post.frontMatter.title}</h1>
          {post.frontMatter.excerpt ? (
            <p className="mt-2 text-xl">{post.frontMatter.excerpt}</p>
          ) : null}
          <time className="flex mt-2 text-gray-400">
            {distanceToNow(new Date(post.frontMatter.date))}
          </time>
        </header>

        <div className="prose mt-10">{content}</div>
      </article>

      <Comment />
    </Container>
  )
}

export async function getStaticPaths() {
  return {
    paths: await getMdxPaths('post'),
    fallback: false,
  }
}

export async function getStaticProps(context) {
  const post = await getMdxNode('post', context)

  if (!post) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      post,
    },
  }
}

export default PostPage
