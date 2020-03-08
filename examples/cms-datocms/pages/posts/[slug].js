import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import fetchAPI, { responsiveImageFragment } from '../../lib/api'
import remark from 'remark'
import html from 'remark-html'
import PostTitle from '../../components/post-title'
import Head from 'next/head'

export default function Post({ post, morePosts }) {
  const router = useRouter()
  if (!router.isFallback && !post?.slug) {
    return <ErrorPage statusCode={404} />
  }
  return (
    <Layout>
      <Container>
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>
              <Head>
                <title>{post.title} | Next.js Blog Example with DatoCMS</title>
                <meta property="og:image" content={post.ogImage.url} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.coverImage}
                date={post.date}
                author={post.author}
              />
              <PostBody content={post.content} />
            </article>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params, preview }) {
  const data = await fetchAPI(
    `
  query PostBySlug($slug: String) {
    post(filter: {slug: {eq: $slug}}) {
      title
      slug
      content
      date
      ogImage: coverImage{
        url(imgixParams: {fm: jpg, fit: crop, w: 2000, h: 1000 })
      }
      coverImage {
        responsiveImage(imgixParams: {fm: jpg, fit: crop, w: 2000, h: 1000 }) {
          ...responsiveImageFragment
        }
      }
      author {
        name
        picture {
          url(imgixParams: {w: 100, h: 100})
        }
      }
    }

    morePosts: allPosts(orderBy: date_DESC, first: 2, filter: {slug: {neq: $slug}}) {
      title
      slug
      excerpt
      date
      coverImage {
        responsiveImage(imgixParams: {fm: jpg, fit: crop, w: 2000, h: 1000 }) {
          ...responsiveImageFragment
        }
      }
      author {
        name
        picture {
          url(imgixParams: {w: 100, h: 100})
        }
      }
    }
  }

  ${responsiveImageFragment}
  `,
    {
      preview,
      variables: {
        slug: params.slug,
      },
    }
  )

  const content = (
    await remark()
      .use(html)
      .processSync(data?.post?.content || '')
  ).toString()

  return {
    props: {
      post: {
        ...data?.post,
        content,
      },
      morePosts: data?.morePosts,
    },
  }
}

export async function getStaticPaths() {
  const data = await fetchAPI(`
  {
    allPosts {
      slug
    }
  }
  `)
  return {
    paths: data.allPosts?.map(post => `/posts/${post.slug}`) || [],
    fallback: true,
  }
}
