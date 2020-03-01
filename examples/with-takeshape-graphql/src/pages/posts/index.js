import Head from 'next/head'
import { graphqlFetch } from '../../lib/takeshape-api'
import PostList from '../../components/post-list'
import baseTheme from '../../base.module.css'

export const postListQuery = `
  query {
    posts: getPostList(sort: [{field: "_enabledAt", order: "desc"}]) {
      total
      items {
        _contentTypeName
        _enabledAt
        title
        slug
        tags {
          name
        }
        deck
        author {
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

export async function unstable_getStaticProps() {
  const data = await graphqlFetch({ query: postListQuery })
  return { props: { data } }
}

export default function Posts({ data }) {
  return (
    <>
      <Head>
        <title key="title">Posts / Shape Blog</title>
        <meta
          key="description"
          name="description"
          content="The Shape Blog post archive"
        />
      </Head>
      <header className={baseTheme.header}>
        <h1>All Posts</h1>
      </header>
      <PostList posts={data.posts.items} />
    </>
  )
}
