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

export async function getStaticPaths() {
  const markdownFiles = require
    .context('../../../content/blogPosts', false, /\.md$/)
    .keys()
    .map(relativePath => relativePath.substring(2))

  const paths = markdownFiles.map(path => ({
    params: {
      slug: path,
    },
  }))

  return { paths, fallback: false }
}

export async function getStaticProps({ params }) {
  const blog = await import(
    `../../../content/blogPosts/${params.slug}.md`
  ).catch(() => null)

  let blogpost = JSON.stringify(blog)
  blogpost = JSON.parse(blogpost)
  return { props: { blogpost } }
}

export default Post
