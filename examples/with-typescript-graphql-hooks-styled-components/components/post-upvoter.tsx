import React from "react";
import { useMutation, UseClientRequestResult } from "graphql-hooks";
import { gql } from "../lib/gql";

const UPDATE_POST = gql`
  mutation UpdatePost($id: ID!, $votes: Int) {
    updatePost(id: $id, votes: $votes) {
      id
      __typename
      votes
    }
  }
`;

type Props = {
  votes: number | null;
  id: string;
  onUpdate: (result: UseClientRequestResult<any>) => void;
};

const PostUpvoter: React.SFC<Props> = ({ votes, id, onUpdate }) => {
  const [updatePost] = useMutation(UPDATE_POST);

  return (
    <button
      onClick={async () => {
        try {
          const result = await updatePost({
            variables: {
              id,
              votes: votes ? votes + 1 : 1
            }
          });

          onUpdate && onUpdate(result);
        } catch (e) {
          console.error("error upvoting post", e);
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
          content: "";
          height: 0;
          margin-right: 5px;
          width: 0;
        }
      `}</style>
    </button>
  );
};

export default PostUpvoter;
