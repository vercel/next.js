import Link from 'next/link'
import path from 'path'
import fs from 'fs'

export async function getServerSideProps() {
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
