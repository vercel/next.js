import Link from 'next/link'

let serverHitCount = 0

export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return {
    props: {
      count: ++serverHitCount,
    },
  }
}

export default ({ count }) => (
  <>
    <p>a slow page</p>
    <p id="hit">hit: {count}</p>
    <Link href="/" id="home">
      to home
    </Link>
    <br />
    <Link href="/something" id="something">
      to something
    </Link>
  </>
)
