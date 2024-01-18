import React from "react";
import { useMutation } from "graphql-hooks";

const CREATE_POST = `
mutation createPost($title: String!, $url: String!) {
  createPost(title: $title, url: $url) {
    id
    title
    votes
    url
    createdAt
  }
}`;

async function handleSubmit(event, onSubmission, createPost) {
  event.preventDefault();
  const form = event.target;
  const formData = new window.FormData(form);
  const title = formData.get("title");
  const url = formData.get("url");
  form.reset();
  const result = await createPost({
    variables: {
      title,
      url,
    },
  });
  onSubmission && onSubmission(result);
}

export default function Submit({ onSubmission }) {
  const [createPost, state] = useMutation(CREATE_POST);

  return (
    <form onSubmit={(event) => handleSubmit(event, onSubmission, createPost)}>
      <h1>Submit</h1>
      <input placeholder="title" name="title" type="text" required />
      <input placeholder="url" name="url" type="url" required />
      <button type="submit">{state.loading ? "Loading..." : "Submit"}</button>
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
