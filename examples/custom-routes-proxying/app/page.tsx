import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h3>Hello World.</h3>
      <Link href="/about">About</Link>
      <br />
      <Link href="/hello/[slug]" as="/hello/world">
        Hello world
      </Link>
    </div>
  );
}
