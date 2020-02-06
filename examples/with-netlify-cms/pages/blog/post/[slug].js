import Layout from '../../../components/layout'

const Post = ({ blogpost }) => {
  if (!blogpost) return <div>not found</div>

  const { html, attributes } = blogpost.default

  return (
    <Layout>
      <article>
        <h1>{attributes.title}</h1>
        <img src={attributes.thumbnail} />
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
      <style jsx>{`
        article {
          margin: 0 auto;
        }
        h1 {
          text-align: center;
        }
      `}</style>
    </Layout>
  )
}

Post.getInitialProps = async ({ query }) => {
  const { slug } = query
  const blogpost = await import(`../../../content/blogPosts/${slug}.md`).catch(
    () => null
  )
  return { blogpost }
}

export default Post
