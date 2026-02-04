import { useRouter } from "next/router";
import Post from "../../components/Post";

const PostPage = () => {
  const router = useRouter();
  const { postId } = router.query;

  return <Post id={postId} pathname={router.pathname} />;
};

export default PostPage;
