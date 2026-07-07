import Link from 'next/link'

export async function getStaticProps() {
  return {
    props: {
      world: 'world',
      time: new Date().getTime(),
    },
  }
}

export default ({ world, time }) => (
  <>
    <p>hello {world}</p>
    <span>time: {time}</span>
    <Link href="/" id="home">
      to home
    </Link>
    <br />
    <Link href="/something" id="something">
      to something
    </Link>
  </>
)
