import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1>About Page</h1>
      <div>
        Back to <Link href="/">Home</Link>
      </div>
    </div>
  );
}
