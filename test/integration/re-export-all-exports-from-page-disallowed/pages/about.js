import fs from 'fs'
import findUp from 'find-up'

const About = ({ world }) => <h1>About {world}</h1>

export default About

export async function getStaticProps() {
  const text = fs
    .readFileSync(
      findUp.sync('world.txt', {
        // eslint-disable-next-line no-eval
        cwd: eval(`__dirname`),
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
