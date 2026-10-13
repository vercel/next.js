import Link from 'next/link'
import dynamic from 'next/dynamic'

const Box = dynamic(() => import('../components/box').then((mod) => mod.Box))

export default function Second({ now }) {
  return (
    <main>
      <p id="second-now">{now}</p>
      <Box />
      <Link href="/" id="to-home">
        Back home
      </Link>
    </main>
  )
}

export async function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
    revalidate: 1,
  }
}
