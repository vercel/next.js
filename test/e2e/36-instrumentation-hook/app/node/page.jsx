export const dynamic = 'force-dynamic'

export default async function NodePage() {
  const { props } = await getServerSideProps()
  return `(node) isOdd: ${props.isOdd}`
}

async function getServerSideProps() {
  return {
    props: {
      isOdd: globalThis.isOdd ? globalThis.isOdd(2) : 'unknown',
    },
  }
}
