export function getServerSideProps() {
  return { props: {} }
}

export default function BadSsr() {
  throw new Error('oops')
}
