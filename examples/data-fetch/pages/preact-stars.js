import Link from 'next/link'

function PreactStars({ stars }) {
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
  const json = await res.json()

  return {
    props: {
      stars: json.stargazers_count,
    },
  }
}

export default PreactStars
