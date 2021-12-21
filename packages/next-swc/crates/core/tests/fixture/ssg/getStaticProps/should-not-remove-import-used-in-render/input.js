import Component from '../'

export default function Test() {
  return <Component />
}

export async function getStaticProps() {
  return { props: { name: Component.displayName } }
}
