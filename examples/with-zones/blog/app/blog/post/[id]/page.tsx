import Link from "next/link";

type Params = Promise<{ id: string }>;

export async function generateMetadata(props: { params: Params }) {
  const { id } = await props.params;
  return {
    title: `Post #${id}`,
    description: "Lorem ipsum",
  };
}

export default async function Post(props: { params: Params }) {
  const { id } = await props.params;
  return (
    <div>
      <h3>Post #{id}</h3>
      <p>Lorem ipsum</p>
      <Link href="/blog">Back to blog</Link>
    </div>
  );
}
