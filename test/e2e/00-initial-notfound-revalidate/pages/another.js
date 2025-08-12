export default function Home({ data }) {
  return 'another page'
}

export const getStaticProps = async () => {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  console.log('revalidating /another', isBuild)
  return {
    props: { data: Math.random() },
    notFound: isBuild,
    revalidate: 1,
  }
}
