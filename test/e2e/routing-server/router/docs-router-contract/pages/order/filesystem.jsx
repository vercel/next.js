export default function Page({ proxy }) {
  return (
    <>
      <p id="destination">filesystem</p>
      <p id="proxy">{proxy}</p>
    </>
  )
}

export function getServerSideProps({ req }) {
  return { props: { proxy: req.headers['x-contract-proxy'] ?? null } }
}
