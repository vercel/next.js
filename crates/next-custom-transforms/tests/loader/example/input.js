import fs from 'fs'
import other from 'other'

const [a, b, ...rest] = fs.promises
const [foo, bar] = other

export async function getStaticProps() {
  a
  b
  rest
  bar
}

class Foo {}

export default function Home() {
  return <div />
}
