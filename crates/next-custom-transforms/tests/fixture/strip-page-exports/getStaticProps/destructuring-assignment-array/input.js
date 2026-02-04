import fs from 'fs'
import other from 'other'

let a, b, rest
;[a, b, ...rest] = fs.promises
let foo, bar
;[foo, bar] = other

export async function getStaticProps() {
  a
  b
  rest
  bar
}
export default function Home() {
  return <div />
}
