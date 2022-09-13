export const config = {
  runtime: 'experimental-edge',
}

export default function Page(props) {
  return (
    <>
      <p id="page">/[id]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getServerSideProps({ params, query }) {
  return {
    props: {
      query,
      params,
      now: Date.now(),
    },
  }
}
