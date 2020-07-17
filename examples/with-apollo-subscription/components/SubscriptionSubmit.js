import { useMutation } from "@apollo/react-hooks";
import gql from "graphql-tag";
import { ALL_POSTS_QUERY, allPostsQueryVars } from "./SubscriptionList";

const CREATE_POST_MUTATION = gql`
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

export default function SubscriptionSubmit() {
  const [createPost, { loading }] = useMutation(CREATE_POST_MUTATION);

  const handleSubmit = event => {
    event.preventDefault();
    const form = event.target;
    const formData = new window.FormData(form);
    const title = formData.get("title");
    const url = formData.get("url");
    form.reset();

    createPost({
      variables: { title, url }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Submit</h1>
      <input placeholder="title" name="title" type="text" required />
      <input placeholder="url" name="url" type="url" required />
      <button type="submit" disabled={loading}>
        Submit
      </button>
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
