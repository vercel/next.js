export async function getServerSideProps({ query }) {
  return { props: { prop: query.prop } }
}

export default function GspPage({ prop }) {
  return <div id="prop">{prop}</div>
}
