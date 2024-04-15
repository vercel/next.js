import { trace } from "@opentelemetry/api";

export async function fetchGithubStars() {
  return await trace
    .getTracer("nextjs-example")
    .startActiveSpan("fetchGithubStars", async (span) => {
      try {
        const res = await fetch("https://api.github.com/repos/vercel/next.js", {
          next: {
            revalidate: 0,
          },
        });
        const data = await res.json();
        return data.stargazers_count;
      } finally {
        span.end();
      }
    });
}
