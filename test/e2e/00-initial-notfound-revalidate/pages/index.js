export default function Home({ data }) {
  return 'index page'
}

export const getStaticProps = async () => {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  console.log('revalidating /', isBuild)
  return {
    props: { data: Math.random() },
    notFound: isBuild,
    revalidate: 1,
  }
}
