import { foo, bar } from 'thing'

export default function Home() {
  foo
  return <div />
}

export function otherExport() {
  foo
  bar
}

export async function getStaticProps() {
  bar
}
