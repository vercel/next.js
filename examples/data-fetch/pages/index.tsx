import { InferGetStaticPropsType } from 'next'

type IndexProps = InferGetStaticPropsType<typeof getStaticProps>

export default function Index({ stars }: IndexProps) {
  return (
    <div>
      <p>Next.js has {stars} ⭐️</p>
    </div>
  )
}

export async function getStaticProps() {
  const res = await fetch('https://api.github.com/repos/vercel/next.js')
  const json = await res.json()
  return { props: { stars: Number(json.stargazers_count) } }
}
