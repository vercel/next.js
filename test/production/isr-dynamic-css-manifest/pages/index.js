import Link from 'next/link'
import { Box } from '../components/box'

export default function Home({ now }) {
  return (
    <main>
      <p id="home-now">{now}</p>
      <Box />
      <Link href="/second" id="to-second">
        Go to second
      </Link>
    </main>
  )
}

export async function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
    // Short window so the test can wait for ISR regeneration.
    revalidate: 1,
  }
}
