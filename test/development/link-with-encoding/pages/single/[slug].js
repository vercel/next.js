export function getServerSideProps({ params: { slug } }) {
  return { props: { slug } }
}

export default function Single(props) {
  return <pre id="query-content">{JSON.stringify(props)}</pre>
}
