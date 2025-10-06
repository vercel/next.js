export default function Page() {
  throw new Error('pages-page-node-error')
}

export function getServerSideProps() {
  return {
    props: {},
  }
}
