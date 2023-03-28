import { trace } from '@opentelemetry/api'

export async function fetchGithubStars() {
  const span = trace.getTracer('nextjs-example').startSpan('fetchGithubStars')
  return fetch('https://api.github.com/repos/vercel/next.js', {
    next: {
      revalidate: 0,
    },
  })
    .then((res) => res.json())
    .then((data) => data.stargazers_count)
    .finally(() => {
      span.end()
    })
}
