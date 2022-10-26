import Link from 'next/link'
import type { InferGetStaticPropsType } from 'next'
import type { Repository } from '../types/github'

export async function getStaticProps() {
  const res = await fetch('https://api.github.com/repos/vercel/next.js')
  const data: Repository = await res.json()
  return {
    props: {
      stars: data.stargazers_count,
    },
  }
}

export default function IndexPage({
  stars,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact-stars">How about preact?</Link>
    </>
  )
}
