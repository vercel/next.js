import React from 'react'
import gql from 'graphql-tag'
import { graphql } from 'react-apollo'

function PostUpvoter (props) {
  return (
    <button onClick={() => props.upvote(props.id, props.votes + 1)}>
      {props.votes}
      <style jsx>{`
        button {
          align-items: center;
          background-color: transparent;
          color: #000;
          display: flex;
          border: 1px solid #e4e4e4;
        }
        button:before {
          align-self: center;
          border-color: transparent transparent #000000 transparent;
          border-style: solid;
          border-width: 0 4px 6px 4px;
          content: "";
          height: 0;
          margin-right: 5px;
          width: 0;
        }
      `}</style>
    </button>
  )
}

const upvotePost = gql`
  mutation updatePost($id: ID!, $votes: Int) {
    updatePost(id: $id, votes: $votes) {
      id
      votes
    }
  }
`

export default graphql(upvotePost, {
  props: ({ ownProps, mutate }) => ({
    upvote: (id, votes) => mutate({
      variables: { id, votes },
      optimisticResponse: {
        updatePost: {
          id: ownProps.id,
          // Note that we can access the props of the container at `ownProps`
          votes: ownProps.votes + 1
        }
      }
    })
  })
})(PostUpvoter)
