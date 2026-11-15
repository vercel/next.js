import Link from "next/link";

export default function HomePage() {
  return (
    <main className="widget">
      <h1>Redis Cache Handler Example</h1>
      <p style={{ color: "#888", textAlign: "center" }}>
        Powered by{" "}
        <a
          href="https://www.npmjs.com/package/@trieb.work/nextjs-turbo-redis-cache"
          className="link"
          target="_blank"
          rel="noopener noreferrer"
        >
          @trieb.work/nextjs-turbo-redis-cache
        </a>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Link className="link" href="/cet">
          Remote Cache Components: time demo &rarr;
        </Link>
        <Link className="link" href="/use-cache">
          Remote Cache Components: fact demo &rarr;
        </Link>
        <Link className="link" href="/isr">
          ISR demo (singular cacheHandler) &rarr;
        </Link>
      </div>
    </main>
  );
}
