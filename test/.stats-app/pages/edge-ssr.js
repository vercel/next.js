export default function page() {
  return 'edge-ssr'
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}

export const config = {
  runtime: 'experimental-edge',
}
