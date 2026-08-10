import { useRouter } from 'next/router'

const SlugPage = (props) => {
  const router = useRouter()

  return router.isFallback ? null : (
    <>
      <div>{props.title}</div>
      <div id="props">{JSON.stringify(props)}</div>
    </>
  )
}

export const getStaticProps = async ({ locale, params }) => {
  if (params.slug === 'my-custom-gone-path') {
    return {
      notFound: true,
    }
  }
  return {
    props: {
      locale,
      params,
      title: params.slug,
    },
  }
}

export const getStaticPaths = async ({ locales }) => {
  const mySlugs = ['my-custom-path-1', 'my-custom-path-2']

  return {
    paths: locales.reduce(
      (paths, locale) => [
        ...paths,
        ...mySlugs.map((slug) => ({ locale, params: { slug } })),
      ],
      []
    ),
    fallback: 'blocking',
  }
}

export default SlugPage
