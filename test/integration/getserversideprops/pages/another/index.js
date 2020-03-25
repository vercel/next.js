import Link from 'next/link'
import fs from 'fs'
import findUp from 'find-up'

export async function getServerSideProps() {
  const text = fs
    .readFileSync(
      findUp.sync('world.txt', {
        // prevent webpack from intercepting
        // eslint-disable-next-line no-eval
        cwd: eval(`__dirname`),
      }),
      'utf8'
    )
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
    <Link href="/">
      <a id="home">to home</a>
    </Link>
    <br />
    <Link href="/something">
      <a id="something">to something</a>
    </Link>
  </>
)
