import Link from 'next/link'
import type { InferGetStaticPropsType } from 'next'
import type { Repository } from '../types/github'

// @ts-ignore
import api from '@opentelemetry/api'

export async function getServerSideProps() {
  const tracer = api.trace.getTracer('nextjs-example')
  const span = tracer.startSpan('getServerSideProps')

  const res = await fetch('https://api.github.com/repos/vercel/next.js')
  const data: Repository = await res.json()
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
