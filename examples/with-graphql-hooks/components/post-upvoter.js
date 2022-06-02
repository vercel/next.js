import React from 'react'
import { useMutation } from 'graphql-hooks'

const UPDATE_POST = `
  mutation votePost($id: String!) {
    votePost(id: $id) {
      id
      votes
      __typename
    }
  }
`

export default function PostUpvoter({ votes, id, onUpdate }) {
  const [updatePost] = useMutation(UPDATE_POST)

  return (
    <button
      className="upvote"
      onClick={async () => {
        try {
          const result = await updatePost({
            variables: {
              id,
            },
          })

          onUpdate && onUpdate(result)
        } catch (e) {
          console.error('error upvoting post', e)
        }
      }}
    >
      {votes}
    </button>
  )
}
