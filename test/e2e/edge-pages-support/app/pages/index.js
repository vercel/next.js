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

export function getServerSideProps({ req, params, query }) {
  return {
    props: {
      url: req.url,
      query,
      now: Date.now(),
      params: params || null,
    },
  }
}
