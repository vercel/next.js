import Link from "next/link";
import { useRouter } from "next/router";

export default function About() {
  const router = useRouter();

  return (
    <div>
      <h3>This is the `hello/[slug]` page. slug: {router.query.slug} </h3>
      <Link href="/">&larr; Back home</Link>
    </div>
  );
}
