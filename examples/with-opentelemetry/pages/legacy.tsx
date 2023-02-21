import Link from 'next/link'
import api from '@opentelemetry/api'

export async function getServerSideProps() {
  const tracer = api.trace.getTracer('nextjs-example')
  const span = tracer.startSpan('a custom span')
  const res = await fetch('https://api.github.com/repos/vercel/next.js')
  const data = await res.json()
  span.end()
  return {
    props: {
      stars: data.stargazers_count,
    },
  }
}

export default function IndexPage({ stars }) {
  return (
    <>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact-stars">How about preact?</Link>
    </>
  )
}
