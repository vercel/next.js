import Link from 'next/link'
import fetch from '../fetch'

export default function Index({ stars }) {
  return (
    <div>
      <p>Next.js has {stars} ⭐️</p>
      <Link href="/preact">How about preact?</Link>
    </div>
  )
}

export async function getStaticProps() {
  const res = await fetch('https://api.github.com/repos/vercel/next.js')
  const json = await res.json() // better use it inside try .. catch
  return {
    props: { stars: json.stargazers_count },
  }
}
