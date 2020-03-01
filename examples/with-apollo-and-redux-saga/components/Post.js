import React from 'react'
import { withRouter } from 'next/router'
import { graphql } from 'react-apollo'
import gql from 'graphql-tag'
import ErrorMessage from './ErrorMessage'
import PostVoteUp from './PostVoteUp'
import PostVoteDown from './PostVoteDown'
import PostVoteCount from './PostVoteCount'

function Post({ id, data: { error, Post } }) {
  if (error) return <ErrorMessage message="Error loading blog post." />
  if (Post) {
    return (
      <section>
        <div key={Post.id}>
          <h1>{Post.title}</h1>
          <p>
            ID: {Post.id}
            <br />
            URL: {Post.url}
          </p>
          <span>
            <PostVoteUp id={Post.id} votes={Post.votes} />
            <PostVoteCount votes={Post.votes} />
            <PostVoteDown id={Post.id} votes={Post.votes} />
          </span>
        </div>
        <style jsx>{`
          span {
            display: flex;
            font-size: 14px;
            margin-right: 5px;
          }
        `}</style>
      </section>
    )
  }
  return <div>Loading</div>
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
const ComponentWithMutation = graphql(post, {
  options: ({ router: { query } }) => ({
    variables: {
      id: query.id,
    },
  }),
  props: ({ data }) => ({
    data,
  }),
})(Post)

export default withRouter(ComponentWithMutation)
