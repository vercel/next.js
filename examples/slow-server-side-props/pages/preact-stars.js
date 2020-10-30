import Link from 'next/link'

function PreactStars(props) {
  const { stars } = props
  if (!stars) {
    return <div>Loading...</div>
  }
  return (
    <div>
      <p>Preact has {stars} ⭐</p>
      <Link href="/">
        <a>I bet Next.js has more stars (?)</a>
      </Link>
    </div>
  )
}

export async function getServerSideProps() {
  const res = await fetch('https://api.github.com/repos/developit/preact')
  const json = await res.json()

  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          props: {
            stars: json.stargazers_count,
          },
        }),
      5000
    )
  })
}

export default PreactStars
