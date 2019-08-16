import { useState } from "react";
import { gql } from "apollo-boost";
import { useMutation } from "@apollo/react-hooks";
import { allPostsQuery, allPostsQueryVars } from "./PostList";

const SUBMIT_FORM_MUTATION = gql`
  mutation createPost($title: String!, $url: String!) {
    createPost(title: $title, url: $url) {
      id
      title
      votes
      url
      createdAt
    }
  }
`;

export default function Submit() {
  const [title, setTitle] = useState("");
  const [url, setURL] = useState("");
  const [submitPost] = useMutation(SUBMIT_FORM_MUTATION);

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        submitPost({
          variables: { title, url },
          refetchQueries: [
            { query: allPostsQuery, variables: allPostsQueryVars }
          ]
        });
        setTitle("");
        setURL("");
      }}
    >
      <h1>Submit</h1>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="title"
        name="title"
        type="text"
        required
      />
      <input
        value={url}
        onChange={e => setURL(e.target.value)}
        placeholder="url"
        name="url"
        type="url"
        required
      />
      <button type="submit">Submit</button>
      <style jsx>{`
        form {
          border-bottom: 1px solid #ececec;
          padding-bottom: 20px;
          margin-bottom: 20px;
        }
        h1 {
          font-size: 20px;
        }
        input {
          display: block;
          margin-bottom: 10px;
        }
      `}</style>
    </form>
  );
}
