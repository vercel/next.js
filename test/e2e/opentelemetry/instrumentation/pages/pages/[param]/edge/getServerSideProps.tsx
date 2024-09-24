export const config = {
  runtime: 'experimental-edge',
}

export default function Page() {
  return <div>Page</div>
}

export function getServerSideProps() {
  return {
    props: {},
  }
}
