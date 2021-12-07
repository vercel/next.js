import Link from 'next/link'
import fetch from '../fetch'

export default function Preact({ stars }) {
  return (
    <div>
      <p>Preact has {stars} ⭐</p>
      <Link href="/">
        <a>I bet Next.js has more stars (?)</a>
      </Link>
    </div>
  )
}

export async function getStaticProps() {
  const res = await fetch('https://api.github.com/repos/developit/preact')
  const json = await res.json() // better use it inside try .. catch
  return {
    props: { stars: json.stargazers_count },
  }
}
