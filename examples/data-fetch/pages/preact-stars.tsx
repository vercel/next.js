import Link from 'next/link'
import type { InferGetStaticPropsType } from 'next'
import type { Repository } from '../types/github'

export async function getStaticProps() {
  try {
    const res = await fetch('https://api.github.com/repos/preactjs/preact')
    const json: Repository = await res.json()
    return {
      props: {
        stars: json.stargazers_count,
      },
    }
  } catch (err) {
    return {
      props: {
        error: err.message,
      },
    }
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
