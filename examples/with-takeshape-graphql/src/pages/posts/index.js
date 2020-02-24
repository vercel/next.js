import React, { Fragment } from 'react'
import Head from 'next/head'
import TakeShape from '../../providers/takeshape'
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

const PostListPage = props => {
  const { data } = props
  return (
    <Fragment>
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
    </Fragment>
  )
}

export async function unstable_getStaticProps() {
  try {
    const res = await TakeShape.graphql({ query: postListQuery })
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

export default PostListPage
