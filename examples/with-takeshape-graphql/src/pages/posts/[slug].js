import React, { Fragment } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Error from 'next/error'
import format from 'date-fns/format'
import TakeShape from '../../providers/takeshape'
import HtmlContent from '../../components/content'
import baseTheme from '../../base.module.css'
import theme from './post.module.css'

export const postQuery = slug => `
  query {
    posts: getPostList(filter: {term: {slug: "${slug}"}}) {
      total
      items {
        _id
        _contentTypeName
        _enabledAt
        title
        tags {
          name
        }
        deck
        author {
          _id
          name
          slug
        }
        featureImage {
          path
        }
        bodyHtml
      }
    }
  }
`

export const postSlugsQuery = `
  query {
    posts: getPostList(sort: [{field: "_enabledAt", order: "desc"}]) {
      items {
        slug
      }
    }
  }
`

const PostPage = ({ data }) => {
  if (!data || data.errors) {
    return <Error statusCode={500} />
  } else if (data.posts.total < 1) {
    return <Error statusCode={404} />
  }
  const {
    _enabledAt,
    title,
    deck,
    tags,
    author,
    bodyHtml,
  } = data.posts.items[0]
  const date = new Date(_enabledAt)
  return (
    <Fragment>
      <Head>
        <title key="title">{title} / Posts / Shape Blog</title>
        <meta key="description" name="description" content={deck} />
      </Head>
      <header className={theme.postHeader}>
        <div className={baseTheme.container}>
          <div className={theme.postHeaderContent}>
            <h2>{title}</h2>
            <p>
              <Link href="/author/[slug]" as={`/author/${author.slug}`}>
                <a>By {author.name}</a>
              </Link>
            </p>
            <p>{format(date, 'MMMM d, yyyy')}</p>
            {tags.length && <p>Tags: {tags.map(t => t.name).join(', ')}</p>}
          </div>
        </div>
      </header>
      <HtmlContent bodyHtml={bodyHtml} />
    </Fragment>
  )
}

export async function unstable_getStaticProps({ params }) {
  try {
    const { slug } = params
    const res = await TakeShape.graphql({ query: postQuery(slug) })
    const json = await res.json()
    if (json.errors) throw json.errors
    const data = json.data
    return {
      props: {
        data,
      },
    }
  } catch (error) {
    console.error(error)
    return error
  }
}

export async function unstable_getStaticPaths() {
  try {
    const res = await TakeShape.graphql({ query: postSlugsQuery })
    const json = await res.json()
    if (json.errors) throw json.errors
    const data = json.data
    const posts = data.posts.items
    return posts.reduce(
      (pages, post) =>
        pages.concat({
          params: { slug: post.slug },
        }),
      []
    )
  } catch (error) {
    console.error(error)
    return error
  }
}

export default PostPage
