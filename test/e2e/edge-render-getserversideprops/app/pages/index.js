export const config = {
  runtime: 'experimental-edge',
}

export default function Page(props) {
  return (
    <>
      <p id="page">/index</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getServerSideProps({ params, query }) {
  return {
    props: {
      query,
      now: Date.now(),
      params: params || null,
    },
  }
}
