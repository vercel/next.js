export default function Home({ data }) {
  return 'dynamic page'
}

export const getStaticProps = async () => {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  console.log('revalidating /blog/[slug]', isBuild)
  return {
    props: { data: Math.random() },
    notFound: isBuild,
    revalidate: 1,
  }
}

export const getStaticPaths = async () => {
  return {
    paths: ['/blog/first'],
    fallback: 'blocking',
  }
}
