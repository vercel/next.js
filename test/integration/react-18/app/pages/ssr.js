export default function SSR() {
  return 'hello'
}

export function getServerSideProps() {
  // Prevent static optimization
  return { props: {} }
}
