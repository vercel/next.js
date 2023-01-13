import type { Post } from '@/gql/graphql'
import React from 'react'
import { useMutation } from '@apollo/client'
import { gql } from '@/gql'

const UPDATE_POST_MUTATION = gql(/* GraphQL */ `
  mutation votePost($id: String!) {
    votePost(id: $id) {
      id
      votes
      __typename
    }
  }
`)

const PostUpvoter: React.FC<Pick<Post, 'id' | 'votes'>> = ({ votes, id }) => {
  const [updatePost] = useMutation(UPDATE_POST_MUTATION)

  const upvotePost: React.MouseEventHandler<HTMLButtonElement> = async (
    event
  ) => {
    event.preventDefault()

    await updatePost({
      variables: {
        id,
      },
      optimisticResponse: {
        __typename: 'Mutation',
        votePost: {
          __typename: 'Post',
          id,
          votes: votes + 1,
        },
      },
    })
  }

  return (
    <button onClick={upvotePost}>
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
}

export default PostUpvoter
