export default function Home({ data }) {
  return 'top-level [slug] page'
}

export const getStaticPaths = () => {
  return {
    paths: ['/initial-not-found'],
    fallback: 'blocking',
  }
}

export const getStaticProps = async ({ locale, defaultLocale }) => {
  console.log('revalidating /[slug]', {
    locale,
    defaultLocale,
  })
  return {
    props: { data: Math.random() },
    notFound: true,
    revalidate: 1,
  }
}
