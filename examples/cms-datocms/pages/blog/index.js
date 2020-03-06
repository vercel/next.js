import Link from 'next/link'
import Nav from '../../components/nav'
import fetchAPI from '../../lib/api'

export async function unstable_getStaticProps({ preview }) {
  const data = await fetchAPI(
    `
  {
    allBlogs {
      title
      slug
      excerpt
      authors {
        picture {
          url(imgixParams: {w: 100, h: 100})
        }
      }
    }
  }
  `,
    { preview }
  )
  return {
    props: data,
  }
}

function BlogCard({ title, slug, excerpt, authors }) {
  return (
    <article className="my-10">
      <time className="text-sm text-gray-600">Thursday, February 6th 2020</time>
      <h2 className="text-2xl my-4">{title}</h2>
      <div className="flex my-4">
        {authors.map((author, index) => {
          return (
            <img
              className={`block h-8 rounded-full ${index !== 0 ? '-ml-4' : ''}`}
              src={author.picture.url}
            />
          )
        })}
      </div>
      <div dangerouslySetInnerHTML={{ __html: excerpt }} />

      <Link href="/blog/[...slug]" as={`/blog/${slug}`}>
        <a className="text-blue-600 hover:text-blue-400">Read more →</a>
      </Link>
    </article>
  )
}

export default ({ allBlogs }) => (
  <>
    <Nav />
    <h1 className="text-4xl my-10 container mx-auto">Blog</h1>
    <hr />
    <section className="container mx-auto">
      {allBlogs.map(blog => {
        return <BlogCard {...blog} />
      })}
    </section>
  </>
)
