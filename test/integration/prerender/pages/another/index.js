import Link from 'next/link'

export const config = {
  experimentalRevalidate: 0,
  experimentalPrerender: true
}

export async function getStaticProps () {
  return {
    props: {
      world: 'world',
      time: new Date().getTime()
    }
  }
}

export default ({ world, time }) => (
  <>
    <p>hello {world}</p>
    <p>time: {time}</p>
    <Link href='/'>
      <a id='home'>to home</a>
    </Link>
    <br />
    <Link href='/something'>
      <a id='somethin'>to something</a>
    </Link>
  </>
)
