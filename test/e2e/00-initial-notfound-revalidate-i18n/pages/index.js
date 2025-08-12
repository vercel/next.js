export default function Home({ data }) {
  return 'index page'
}

export const getStaticProps = async ({ locale, defaultLocale }) => {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  const isNotFound = isBuild && locale !== defaultLocale
  console.log('revalidating /', { isBuild, locale, defaultLocale, isNotFound })
  return {
    props: { data: Math.random() },
    notFound: isNotFound,
    revalidate: 1,
  }
}
