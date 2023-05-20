import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import camelcaseKeys from 'camelcase-keys'

import { getPost, getPostsData, getCategories } from '@/lib/api'

import HumanDate from '@/components/human-date'
import CategoriesWidget from '@/components/blog/categories-widget'
import SearchWidget from '@/components/blog/search-widget'
import AuthorCard from '@/components/author-card'
import Preloader from '@/components/preloader'

export default function BlogPost({ post, categories }) {
  const router = useRouter()
  if (router.isFallback) {
    return <Preloader />
  }

  if (!post) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <>
      <Head>
        <meta charSet="utf-8" />
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        <title>{post.seoTitle}</title>
        <meta name="description" content={post.metaDescription} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="shortcut icon"
          type="image/x-icon"
          href="https://buttercms.com/static/v2/images/favicon.png"
        />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={post.url} />
        <meta property="og:title" content={post.seoTitle} />
        <meta property="og:image" content={post.featuredImage} />
        <meta property="og:description" content={post.metaDescription} />
        <meta name="twitter:site" content="@ButterCMS" />
        <meta name="twitter:creator" content="@ButterCMS" />
        <meta name="twitter:title" content="ButterCMS Blog" />
        <meta name="twitter:description" content={post.metaDescription} />
      </Head>
      <section id="blog-header" className="single-post-nav">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-12">
              <div className="section-title text-center">
                <h2>{post.title}</h2>
                <ul className="breadcrumb-nav">
                  <li>
                    <Link href="/">Home</Link>
                  </li>
                  <li>
                    <Link href="/blog">Blog</Link>
                  </li>
                  <li>{post.title}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="blog-post">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-8 col-md-12 col-12">
              <div className="single-post">
                <div className="single-post-meta">
                  <h2 className="single-post-header">{post.title}</h2>
                  <ul className="single-post-meta-info">
                    <li>
                      <AuthorCard author={post.author} />
                    </li>
                    <li>
                      <a>
                        <i className="lni lni-calendar"></i>{' '}
                        <HumanDate dateString={post.published} />
                      </a>
                    </li>
                    {post.tags.map((tag) => (
                      <li key={tag.slug}>
                        <Link href={`/blog/tag/${tag.slug}`}>
                          <i className="lni lni-tag"></i> {tag.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                {post.featuredImage && (
                  <div className="single-post-thumbnail">
                    <Image
                      src={post.featuredImage}
                      alt={post.featuredImageAlt}
                      layout="fill"
                      objectFit="cover"
                    />
                  </div>
                )}
                <div
                  className="single-post-body prose"
                  dangerouslySetInnerHTML={{ __html: post.body }}
                ></div>
              </div>
            </div>

            <aside className="col-12 col-lg-4">
              <SearchWidget />
              <CategoriesWidget categories={categories || []} />
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}

export async function getStaticProps({ params }) {
  try {
    const post = await getPost(params.slug)
    const categories = await getCategories()
    return { props: { post: camelcaseKeys(post), categories } }
  } catch (e) {
    console.error(`Couldn't load post or categories data.`, e)

    return {
      notFound: true,
    }
  }
}

export async function getStaticPaths() {
  const butterToken = process.env.NEXT_PUBLIC_BUTTER_CMS_API_KEY

  if (butterToken) {
    try {
      const posts = (await getPostsData()).posts

      return {
        paths: posts.map((post) => `/blog/${post.slug}`),
        fallback: true,
      }
    } catch (e) {
      console.error(`Couldn't load posts.`, e)
    }
  }

  return {
    paths: [],
    fallback: false,
  }
}
