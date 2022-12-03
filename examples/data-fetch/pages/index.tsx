import Link from 'next/link'
import type { InferGetStaticPropsType } from 'next'
import type { Repository } from '../types/github'

export async function getStaticProps() {
  try {
    const res = await fetch('https://api.github.com/repos/vercel/next.js')
    const data: Repository = await res.json()
    return {
      props: {
        stars: data.stargazers_count,
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
