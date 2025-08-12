import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p>/blog/[slug]</p>
      <p>{JSON.stringify(router.query)}</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  if (params.slug === 'second') {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'first' } }, { params: { slug: 'second' } }],
    fallback: 'blocking',
  }
}
