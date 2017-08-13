import React from 'react'
import { createFragmentContainer, graphql } from 'react-relay'

const BlogPostPreview = props => {
  return (
    <div key={props.post.id}>{props.post.title}</div>
  )
}

export default createFragmentContainer(BlogPostPreview, {
  post: graphql`
        fragment BlogPostPreview_post on BlogPost {
            id
            title
        }
    `
})
