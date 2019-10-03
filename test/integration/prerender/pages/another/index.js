import Link from 'next/link'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps () {
  return {
    props: {
      world: 'world',
      time: new Date().getTime()
    },
    revalidate: 0
  }
}

export default ({ world, time }) => (
  <>
    <p>hello {world}</p>
    <span>time: {time}</span>
    <Link href='/'>
      <a id='home'>to home</a>
    </Link>
    <br />
    <Link href='/something'>
      <a id='something'>to something</a>
    </Link>
  </>
)
