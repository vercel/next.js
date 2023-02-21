import Link from 'next/link'

export default async function Page() {
  const stars = await fetch('https://api.github.com/repos/vercel/next.js', {
    next: {
      revalidate: 0,
    },
  })
    .then((res) => res.json())
    .then((data) => data.stargazers_count)
  return (
    <>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact-stars">How about preact?</Link>
    </>
  )
}
