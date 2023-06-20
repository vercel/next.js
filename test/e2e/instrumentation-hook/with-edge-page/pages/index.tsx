export default function Page() {
  return <p>Edge</p>
}

export function getServerSideProps() {
  return {
    props: {},
  }
}

export const config = {
  runtime: 'experimental-edge',
}
