import Link from 'next/link'
import fs from 'fs'
import path from 'path'

export async function getStaticProps() {
  const text = fs
    .readFileSync(path.join(process.cwd(), 'world.txt'), 'utf8')
    .trim()
  return {
    props: {
      world: text,
      time: new Date().getTime(),
    },
  }
}

export default ({ world, time }) => (
  <>
    <p>hello {world}</p>
    <span id="anotherTime">time: {time}</span>
    <Link href="/" id="home">
      to home
    </Link>
    <br />
    <Link href="/something" id="something">
      to something
    </Link>
  </>
)
