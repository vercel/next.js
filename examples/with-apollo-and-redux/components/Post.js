import React from 'react'
import { gql, graphql } from 'react-apollo'
import PostUpvoter from './PostUpvoter'

function Post ({ id, data: { loading, error, Post } }) {
  return (
    <section>
      <div key={Post.id}>
        <h1>{Post.title}</h1>
        <p>ID: {Post.id}<br />URL: {Post.url}</p>
        <PostUpvoter id={Post.id} votes={Post.votes} />
      </div>
    </section>
  )
}

const post = gql`
    query post($id: ID!) {
        Post(id: $id) {
            id
            title
            votes
            url
            createdAt
        }
    }
`

// The `graphql` wrapper executes a GraphQL query and makes the results
// available on the `data` prop of the wrapped component (PostList)
// Tip: ownProps is parent component's props
export default graphql(post, {
  options: (ownProps) => {
    return {
      variables: {
        id: ownProps.id
      }
    }
  }
})(Post)
