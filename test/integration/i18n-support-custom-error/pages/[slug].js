import { useRouter } from 'next/router'

const SlugPage = (props) => {
  const router = useRouter()

  return router.isFallback ? null : (
    <>
      <div>{props.title}</div>
    </>
  )
}

export const getStaticProps = async (ctx) => {
  if (ctx.params.slug === 'my-custom-path-3') {
    return {
      notFound: true,
    }
  }
  return {
    props: {
      title: ctx.params.slug,
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
