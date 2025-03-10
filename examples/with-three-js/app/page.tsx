import Link from "next/link";

export default function Home() {
  return (
    <div className="main">
      <Link href="/birds">Birds Example</Link>
      <Link href="/boxes">Boxes Example</Link>
    </div>
  );
}
