export default function Page() {
  return 'Hello World'
}

export const getStaticProps = async ({ locale, params }) => {
  const id = params?.['slug']
  if (!id) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      locale,
    },
  }
}

export const getStaticPaths = async () => {
  return {
    paths: [{ params: { slug: 'test' } }],
    fallback: false,
  }
}
