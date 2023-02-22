import Link from 'next/link'
import { fetchGithubStars } from '../shared/fetch-github-stars'

export default async function Page() {
  const stars = await fetchGithubStars()
  return (
    <>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact-stars">How about preact?</Link>
    </>
  )
}
