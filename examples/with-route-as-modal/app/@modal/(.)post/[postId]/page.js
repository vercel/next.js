import PostModal from "./PostModal";

export default async function PostModalPage({ params }) {
  const { postId } = await params;

  return <PostModal postId={postId} />;
}
