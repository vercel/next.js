import React from 'react'
import { graphql } from 'react-apollo'
import gql from 'graphql-tag'

import PostVoteButton from './PostVoteButton'

function PostVoteDown ({ downvote, votes, id }) {
  return (
    <PostVoteButton
      className='downvote'
      onClickHandler={() => downvote(id, votes - 1)}
    />
  )
}

const downvotePost = gql`
  mutation updatePost($id: ID!, $votes: Int) {
    updatePost(id: $id, votes: $votes) {
      id
      __typename
      votes
    }
  }
`

export default graphql(downvotePost, {
  props: ({ ownProps, mutate }) => ({
    downvote: (id, votes) =>
      mutate({
        variables: { id, votes },
        optimisticResponse: {
          __typename: 'Mutation',
          updatePost: {
            __typename: 'Post',
            id: ownProps.id,
            votes: ownProps.votes - 1
          }
        }
      })
  })
})(PostVoteDown)
