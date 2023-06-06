import Link from 'next/link'

export default async function Home() {
  const res = await fetch('https://api.github.com/repos/vercel/next.js')
  const data = await res.json()
  const stars = data.stargazers_count

  return (
    <>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact">How about preact?</Link>
    </>
  )
}
