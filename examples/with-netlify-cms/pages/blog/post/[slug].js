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
  return {
    paths: [
      {
        params: {
          slug: '2019-09-06_its_not_the_problem_you_want_to_solve_boiiiiii',
        },
      },
      {
        params: {
          slug: '2019-09-06_why_did_the_chicken_cross_the_road',
        },
      },
    ],
    fallback: false,
  }
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
