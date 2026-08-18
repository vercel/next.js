import 'nested-structure/constants'

export default function Page() {
  return <p>another page</p>
}

export function getStaticProps() {
  return {
    props: {},
  }
}
