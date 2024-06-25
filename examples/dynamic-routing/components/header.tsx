import Link from "next/link";

export default function Header() {
  return (
    <header>
      <ul>
        <li>
          <Link href="/">Home</Link>
        </li>
        <li>
          <Link href="/about">About</Link>
        </li>
        <li>
          <Link href="/post/first">First Post</Link>
        </li>
        <li>
          <Link href="/post/second">Second Post</Link>
        </li>
      </ul>
    </header>
  );
}
