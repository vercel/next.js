export default function Page() {
  throw new Error('pages-page-edge-error')
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}

export const runtime = 'experimental-edge'
