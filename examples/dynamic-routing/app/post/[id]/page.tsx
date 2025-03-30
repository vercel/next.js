import Link from "next/link";
import Header from "../../_components/header";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PostPage(props: Props) {
  const params = await props.params;
  return (
    <>
      <Header />
      <h1>Post: {params.id}</h1>
      <ul>
        <li>
          <Link href={`/post/${params.id}/first-comment`}>First comment</Link>
        </li>
        <li>
          <Link href={`/post/${params.id}/second-comment`}>Second comment</Link>
        </li>
      </ul>
    </>
  );
}
