import Post from "../../../components/Post";

export default async function PostPage({ params }) {
  const { postId } = await params;

  return <Post id={postId} pathname={`/post/${postId}`} />;
}
