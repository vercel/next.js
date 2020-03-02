import React from 'react'
import { createFragmentContainer, graphql } from 'react-relay'
import { BlogPostPreview_post } from './__generated__/BlogPostPreview_post.graphql'

const BlogPostPreview = ({ post }: { post: BlogPostPreview_post }) => (
  <li>{post.title}</li>
)

export default createFragmentContainer(BlogPostPreview, {
  post: graphql`
    fragment BlogPostPreview_post on BlogPost {
      id
      title
    }
  `,
})
