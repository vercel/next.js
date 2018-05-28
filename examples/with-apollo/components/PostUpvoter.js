import React from 'react'
import { Mutation } from 'react-apollo'
import gql from 'graphql-tag'

export default ({ id, votes }) => (
  <Mutation
    mutation={gql`
      mutation updatePost($id: ID!, $votes: Int) {
        updatePost(id: $id, votes: $votes) {
          __typename
          id
          votes
        }
      }
    `}
    variables={{ id, votes: votes + 1 }}
    optimisticResponse={{
      updatePost: {
        __typename: 'Post',
        id,
        votes: votes + 1
      }
    }}
  >
    {upvote => (
      <button onClick={() => { upvote() }}>
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
    )}
  </Mutation>
)
