export default function Page({ params }) {
  return (
    <>
      <p id="destination">dynamic</p>
      <pre id="params">{JSON.stringify(params)}</pre>
    </>
  )
}

export function getServerSideProps({ params }) {
  return { props: { params } }
}
