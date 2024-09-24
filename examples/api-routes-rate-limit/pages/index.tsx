import { useState } from "react";
import styles from "../styles.module.css";

export default function Index() {
  const [response, setResponse] = useState<Record<string, unknown> | null>(
    null,
  );

  const makeRequest = async () => {
    const res = await fetch("/api/user");

    setResponse({
      status: res.status,
      body: await res.json(),
      limit: res.headers.get("X-RateLimit-Limit"),
      remaining: res.headers.get("X-RateLimit-Remaining"),
    });
  };

  return (
    <main className={styles.container}>
      <h1>Next.js API Routes Rate Limiting</h1>
      <p>
        This example uses <code className={styles.inlineCode}>lru-cache</code>{" "}
        to implement a simple rate limiter for API routes (Serverless
        Functions).
      </p>
      <button onClick={() => makeRequest()}>Make Request</button>
      {response && (
        <code className={styles.code}>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </code>
      )}
    </main>
  );
}
