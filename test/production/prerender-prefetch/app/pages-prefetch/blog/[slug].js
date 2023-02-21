export default function Page(props) {
  return (
    <>
      <p id="page">blog/[slug]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getServerSideProps({ query }) {
  return {
    props: {
      query,
      now: Date.now(),
    },
  }
}
