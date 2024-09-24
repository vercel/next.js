import postStyles from "./post-styles.module.css";

export default function PostBody({ content }) {
  return (
    <div
      className={`max-w-2xl mx-auto post ${postStyles.post}`}
      dangerouslySetInnerHTML={{ __html: content?.html }}
    />
  );
}
