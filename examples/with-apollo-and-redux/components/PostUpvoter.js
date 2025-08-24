import { gql, useMutation } from "@apollo/client";
import PropTypes from "prop-types";

const VOTE_POST = gql`
  mutation votePost($id: String!) {
    votePost(id: $id) {
      __typename
      id
      votes
    }
  }
`;

const PostUpvoter = ({ votes, id }) => {
  const [votePost] = useMutation(VOTE_POST);

  const upvotePost = () => {
    votePost({
      variables: {
        id,
      },
      optimisticResponse: {
        __typename: "Mutation",
        updatePost: {
          __typename: "Post",
          id,
          votes: votes + 1,
        },
      },
    });
  };

  return (
    <button onClick={() => upvotePost()}>
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

PostUpvoter.propTypes = {
  id: PropTypes.string.isRequired,
  votes: PropTypes.number.isRequired,
};

export default PostUpvoter;
