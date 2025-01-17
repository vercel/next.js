import Link from "next/link";

export default function About({ params }: { params: { slug: string } }) {
  return (
    <div>
      <h3>This is the `hello/[slug]` page. slug: {params.slug} </h3>
      <Link href="/">&larr; Back home</Link>
    </div>
  );
}
