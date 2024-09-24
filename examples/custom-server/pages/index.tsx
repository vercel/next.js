import Link from "next/link";

export default function Home() {
  return (
    <ul>
      <li>
        <Link href="/a">/a (Pages Router)</Link>
      </li>
      <li>
        <Link href="/b">b (App Router)</Link>
      </li>
    </ul>
  );
}
