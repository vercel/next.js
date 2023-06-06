import Link from 'next/link'

export default async function Home() {
  const res = await fetch('https://api.github.com/repos/preactjs/preact')
  const data = await res.json()
  const stars = data.stargazers_count

  return (
    <>
      <p>Preact has {stars} ⭐</p>
      <Link href="/">I bet Next.js has more stars (?)</Link>
    </>
  )
}
