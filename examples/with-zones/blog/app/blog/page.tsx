import Link from "next/link";

export default function Blog() {
  return (
    <div>
      <h3>This is our blog</h3>
      <ul>
        <li>
          <Link href="/blog/post/1">Post 1</Link>
        </li>
        <li>
          <Link href="/blog/post/2">Post 2</Link>
        </li>
      </ul>
      <Link href="/">Home</Link>
    </div>
  );
}
