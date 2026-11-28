export default function Home() {
  return <h1>Home</h1>
}

export function getServerSideProps({ query }) {
  if (query.fail) {
    throw new Error('Intentional server error')
  }

  return {
    props: {},
  }
}
