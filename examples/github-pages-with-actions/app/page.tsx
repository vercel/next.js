import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <div>
        Go to <Link href="/about">About</Link> page
      </div>
    </div>
  );
}
