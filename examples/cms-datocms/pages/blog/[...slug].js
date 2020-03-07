import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Nav from '../../components/nav'
import fetchAPI from '../../lib/api'

export async function getStaticProps({ params, preview }) {
  const data = await fetchAPI(
    `
  query BlogBySlug($slug: String) {
    blog(filter: {slug: {eq: $slug}}) {
      title
      content
      authors {
        name
        twitter
        picture {
          url(imgixParams: {w: 100, h: 100})
        }
      }
    }
  }
  `,
    {
      preview,
      variables: {
        slug: params.slug.join('/'),
      },
    }
  )
  return {
    props: data,
  }
}

export async function getStaticPaths() {
  const data = await fetchAPI(`
  {
    allBlogs {
      slug
    }
  }
  `)
  return {
    paths: data.allBlogs?.map(blog => `/blog/${blog.slug}`) || [],
    fallback: false,
  }
}

function AuthorCard({ name, twitter, picture }) {
  return (
    <div className="flex mx-2">
      <img className="block h-8 mx-2 rounded-full" src={picture} />
      <div className="leading-none">
        {name}
        <br />
        <a
          href={`https://twitter.com/${twitter}`}
          className="text-xs text-blue-600"
        >
          @{twitter}
        </a>
      </div>
    </div>
  )
}

export default ({ blog }) => {
  const router = useRouter()

  if (!router.isFallback && !blog) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <>
      <Nav />
      <article>
        <div className="my-10">
          <div className="text-center my-10">
            <h1 className="text-2xl text-4xl">
              {router.isFallback ? 'Loading...' : blog.title}
            </h1>
            <time className="text-sm text-gray-600">
              Thursday, February 6th 2020
            </time>
          </div>
          <div className="container mx-auto flex justify-center my-4">
            {blog?.authors?.map(author => {
              return (
                <AuthorCard
                  name={author.name}
                  twitter={author.twitter}
                  picture={author.picture.url}
                />
              )
            })}
          </div>
        </div>
        <hr />
        <div className="container mx-auto my-10">
          <div
            className="mx-64"
            dangerouslySetInnerHTML={{
              __html: router.isFallback ? 'Loading...' : blog.content,
            }}
          />
        </div>
      </article>
    </>
  )
}
