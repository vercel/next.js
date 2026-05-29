import Link from "next/link";
export default function About() {
  return (
    <div>
      <h3>This is the /about page. </h3>
      <Link href="/">&larr; Back home</Link>
    </div>
  );
}
