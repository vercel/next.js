import React from 'react'
import { createFragmentContainer, graphql } from 'react-relay'
import BlogPostPreview from './BlogPostPreview'
import Router from 'next/router'

const BlogPosts = props => {
  let afterParam = props.viewer.allBlogPosts.pageInfo.endCursor
  afterParam = afterParam ? `&after=${afterParam}` : ''

  let hasNextPage = props.viewer.allBlogPosts.pageInfo.hasNextPage
  hasNextPage = hasNextPage || props.relayVariables.before

  let hasPrevPage = props.viewer.allBlogPosts.pageInfo.hasPreviousPage
  hasPrevPage = hasPrevPage || props.relayVariables.after

  let beforeParam = props.viewer.allBlogPosts.pageInfo.startCursor
  beforeParam = beforeParam ? `&before=${beforeParam}` : ''

  const nextOnClick = () => Router.push(`/?first=2${afterParam}`)
  const prevOnClick = () => Router.push(`/?last=2${beforeParam}`)

  return (
    <div>
      <h1>Blog posts</h1>
      {props.viewer.allBlogPosts.edges.map(({ node }) =>
        <BlogPostPreview key={node.id} post={node} />
      )}
      <br />
      <button disabled={!hasPrevPage} onClick={prevOnClick}>
        Previous Page
      </button>
      &nbsp;
      <button disabled={!hasNextPage} onClick={nextOnClick}>
        Next Page
      </button>
    </div>
  )
}

export default createFragmentContainer(BlogPosts, {
  viewer: graphql`
    fragment BlogPosts_viewer on Viewer {
      allBlogPosts {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          node {
            ...BlogPostPreview_post
            id
          }
        }
      }
    }
  `
})
