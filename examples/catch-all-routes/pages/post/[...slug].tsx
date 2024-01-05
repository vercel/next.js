import { useRouter } from "next/router";
import Header from "../../components/header";

const Comment = () => {
  const router = useRouter();
  const slug = (router.query.slug as string[]) || [];

  return (
    <>
      <Header />
      <h1>Slug: {slug.join("/")}</h1>
    </>
  );
};

export default Comment;
