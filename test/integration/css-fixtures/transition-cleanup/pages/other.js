import css from './other.module.css'

export default function Other() {
  throw new Error(`oops ${css.root}`)
}

export function getServerSideProps() {
  return { props: {} }
}
