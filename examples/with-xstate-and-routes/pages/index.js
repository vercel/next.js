import Link from "next/link";

export default function IndexPage() {
  return (
    <div>
      <h1>Start</h1>
      Go to <Link href="/step/1">Step 1</Link>
    </div>
  );
}
