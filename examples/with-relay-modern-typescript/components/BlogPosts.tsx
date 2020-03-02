import React from 'react'
import { createFragmentContainer, graphql } from 'react-relay'
import BlogPostPreview from './BlogPostPreview'
import { BlogPosts_viewer } from './__generated__/BlogPosts_viewer.graphql'

const BlogPosts = ({ viewer }: { viewer: BlogPosts_viewer }) => (
  <div>
    <h1>Blog posts</h1>
    <ul>
      {viewer.allBlogPosts.edges?.map(
        e => e?.node && <BlogPostPreview key={e.node.id} post={e.node} />
      )}
    </ul>
  </div>
)

export default createFragmentContainer(BlogPosts, {
  viewer: graphql`
    fragment BlogPosts_viewer on Viewer {
      allBlogPosts(first: 10, orderBy: createdAt_DESC) {
        edges {
          node {
            ...BlogPostPreview_post
            id
          }
        }
      }
    }
  `,
})
