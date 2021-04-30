import { getAllNodes } from 'next-mdx'
import NextLink from 'next/link'
import Container from '../../components/container'

function NotePage({ posts }) {
  return (
    <Container>
      {posts.length ? (
        posts.map((post) => (
          <article key={post.slug} className="mb-10">
            <NextLink href={post.url} passHref>
              <a className="text-lg leading-6 font-bold">
                {post.frontMatter.title}
              </a>
            </NextLink>
            <p>{post.frontMatter.excerpt}</p>
            <div className="text-gray-400">
              <time>{post.frontMatter.date}</time>
            </div>
          </article>
        ))
      ) : (
        <p>No blog posted yet :/</p>
      )}
    </Container>
  )
}

export async function getStaticProps() {
  const posts = await getAllNodes('post')

  return {
    props: {
      posts
    }
  }
}

export default NotePage
