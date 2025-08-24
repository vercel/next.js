import fs from 'fs'
import findUp from 'find-up'

export default ({ world }) => <h1>About {world}</h1>

export async function getStaticProps() {
  const text = fs
    .readFileSync(
      findUp.sync('world.txt', {
        cwd: process.cwd(),
      }),
      'utf8'
    )
    .trim()

  return {
    props: {
      world: text,
    },
  }
}
