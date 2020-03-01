import Head from 'next/head'
import Link from 'next/link'
import format from 'date-fns/format'
import { graphqlFetch } from '../../lib/takeshape-api'
import Content from '../../components/content'
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

export async function getStaticProps({ params }) {
  const data = await graphqlFetch({ query: postQuery(params.slug) })
  return { props: { data } }
}

export async function getStaticPaths() {
  const data = await graphqlFetch({ query: postSlugsQuery })
  const posts = data.posts.items

  return {
    paths: posts.reduce(
      (pages, post) =>
        pages.concat({
          params: { slug: post.slug },
        }),
      []
    ),
    fallback: false,
  }
}

export default function Post({ data }) {
  const {
    _enabledAt,
    title,
    deck,
    tags,
    author,
    bodyHtml,
  } = data.posts.items[0]

  return (
    <>
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
            <p>{format(new Date(_enabledAt), 'MMMM d, yyyy')}</p>
            {tags.length && <p>Tags: {tags.map(t => t.name).join(', ')}</p>}
          </div>
        </div>
      </header>
      <Content bodyHtml={bodyHtml} />
    </>
  )
}
