export function getServerSideProps({ query }) {
  if (query.fail) throw new Error('boom')
  return { props: {} }
}

export default function Home() {
  return <p>home</p>
}
