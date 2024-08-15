import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>Index</h1>
      <p>
        <Link href="/about">Go to about page (will redirect)</Link>
      </p>
      <p>
        <Link href="/another">Go to another page (will rewrite)</Link>
      </p>
      <p>
        <Link href="/about2">Go to about 2 page (no redirect or rewrite)</Link>
      </p>
    </div>
  );
}
