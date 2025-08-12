export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export default async function EdgePage() {
  const { props } = await getServerSideProps()
  return `(edge) isOdd: ${props.isOdd}`
}

async function getServerSideProps() {
  return {
    props: {
      isOdd: globalThis.isOdd ? globalThis.isOdd(2) : 'unknown',
    },
  }
}
