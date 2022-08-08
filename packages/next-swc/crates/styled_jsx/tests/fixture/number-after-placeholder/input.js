import Link from "next/link";

export default function IndexPage() {
  return (
    <div>
      Hello World.{" "}
      <Link href="/about">
        <a>Abound</a>
      </Link>
      <style jsx>{`
        a {
          color: ${"#abcdef"}12;
        }
      `}</style>
    </div>
  );
}