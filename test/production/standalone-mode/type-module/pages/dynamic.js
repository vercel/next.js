export default function Dynamic({ now }) {
  return <p id="content">dynamic-{now}</p>
}

export async function getServerSideProps() {
  return { props: { now: 'rendered-at-runtime' } }
}
