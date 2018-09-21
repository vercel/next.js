import React from 'react'
import { ApolloConsumer } from 'react-apollo'
import { gql } from 'apollo-boost'

export default function PostUpvoter ({ votes, id }) {
  return (
    <ApolloConsumer>
      {client => {
        return (
          <button onClick={() => upvote(id, votes + 1, client)}>
            {votes}
            <style jsx>{`
              button {
                background-color: transparent;
                border: 1px solid #e4e4e4;
                color: #000;
              }
              button:active {
                background-color: transparent;
              }
              button:before {
                align-self: center;
                border-color: transparent transparent #000000 transparent;
                border-style: solid;
                border-width: 0 4px 6px 4px;
                content: '';
                height: 0;
                margin-right: 5px;
                width: 0;
              }
            `}</style>
          </button>
        )
      }}
    </ApolloConsumer>
  )
}

const upvotePost = gql`
  mutation updatePost($id: ID!, $votes: Int) {
    updatePost(id: $id, votes: $votes) {
      id
      __typename
      votes
    }
  }
`

function upvote (id, votes, client) {
  client.mutate({
    mutation: upvotePost,
    variables: {id, votes},
    optimisticResponse: {
      __typename: 'Mutation',
      updatePost: {
        __typename: 'Post',
        id,
        votes,
      }
    }
  })
}
