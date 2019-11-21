import React from 'react'
import { createFragmentContainer, graphql } from 'react-relay'

const BlogPostPreview = props => {
  return (
    <React.Fragment>
      <div>{props.post.title}</div>
      <div>{props.post.content}</div>
      <br />
    </React.Fragment>
  )
}

export default createFragmentContainer(BlogPostPreview, {
  post: graphql`
    fragment BlogPostPreview_post on BlogPost {
      id
      title
      content
    }
  `,
})
