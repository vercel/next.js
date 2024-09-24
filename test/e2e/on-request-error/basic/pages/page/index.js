export default function Page() {
  throw new Error('pages-page-node-error')
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}
