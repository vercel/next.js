import Link from 'next/link'
import type { InferGetStaticPropsType } from 'next'
import type { Repository } from '../types/github'

export async function getStaticProps() {
  const res = await fetch('https://api.github.com/repos/preactjs/preact')
  const json: Repository = await res.json()
  return {
    props: {
      stars: json.stargazers_count,
    },
  }
}

export default function PreactStarsPage({
  stars,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <p>Preact has {stars} ⭐</p>
      <Link href="/">I bet Next.js has more stars (?)</Link>
    </>
  )
}
