export function getServerSideProps({ query }) {
  return { props: query }
}

export default function Single(props) {
  return <pre id="query-content">{JSON.stringify(props)}</pre>
}
