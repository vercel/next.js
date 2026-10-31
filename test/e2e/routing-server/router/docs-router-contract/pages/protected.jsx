export default function Page({ marker }) {
  return <p>{marker}</p>
}

export function getServerSideProps({ req }) {
  return {
    props: {
      marker: 'protected destination',
      proxy: req.headers['x-contract-proxy'] ?? null,
    },
  }
}
