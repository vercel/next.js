import Link from "next/link";

export default function Home() {
  return (
    <main>
      <div>
        <h1>API Documentation</h1>
        <p>Demo of next-openapi-gen library</p>
        <div>
          <Link href="/api-docs">View API Docs</Link>
          {' | '}
          <Link href="/openapi.json">OpenAPI JSON</Link>
        </div>
      </div>
    </main>
  );
}
