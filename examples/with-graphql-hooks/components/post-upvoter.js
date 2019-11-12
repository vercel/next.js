import React from 'react'
import { useMutation } from 'graphql-hooks'

const UPDATE_POST = `
  mutation updatePost($id: ID!, $votes: Int) {
    updatePost(id: $id, votes: $votes) {
      id
      __typename
      votes
    }
  }
`

export default function PostUpvoter({ votes, id, onUpdate }) {
  const [updatePost] = useMutation(UPDATE_POST)

  return (
    <button
      onClick={async () => {
        try {
          const result = await updatePost({
            variables: {
              id,
              votes: votes + 1,
            },
          })

          onUpdate && onUpdate(result)
        } catch (e) {
          console.error('error upvoting post', e)
        }
      }}
    >
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
