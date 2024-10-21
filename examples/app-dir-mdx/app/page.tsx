import Link from "next/link";
import Content from "./message.mdx";

export default function Home() {
  return (
    <main>
      <div>
        <div>
          <Content />
        </div>
        <Link href={"/blog/hello-world"} style={{ color: "blue", textDecoration: "underline" }}>
          Page made with .mdx extension in the app directory
        </Link>
      </div>
    </main>
  );
}
