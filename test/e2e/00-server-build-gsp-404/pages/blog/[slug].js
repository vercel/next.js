export const getStaticPaths = () => {
  return {
    paths: ['/blog/post-1'],
    fallback: 'blocking',
  }
}

export const getStaticProps = ({ params }) => {
  console.log({ params })

  if (params.slug?.includes('missing')) {
    return {
      notFound: true,
      revalidate: 1,
    }
  }
  return {
    props: {
      slug: params.slug || null,
    },
    revalidate: 1,
  }
}

export default function Page({ slug }) {
  return <p>slug: {slug}</p>
}
