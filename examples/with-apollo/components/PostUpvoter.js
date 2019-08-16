import React from "react";
import { gql } from "apollo-boost";
import { useMutation } from "@apollo/react-hooks";

const UPVOTE_POST_MUTATION = gql`
  mutation updatePost($id: ID!, $votes: Int) {
    updatePost(id: $id, votes: $votes) {
      id
      __typename
      votes
    }
  }
`;

export default function PostUpvoter({ votes, id }) {
  const [upvotePost] = useMutation(UPVOTE_POST_MUTATION);

  return (
    <button
      onClick={() => {
        upvotePost({
          variables: {
            id,
            votes: votes + 1
          }
        });
      }}
    >
      {votes}
    </button>
  );
}
