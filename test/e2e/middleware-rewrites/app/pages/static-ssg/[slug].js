import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <p id="page">/static-ssg/[slug]</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="as-path">{router.asPath}</p>
    </>
  )
}

export function getStaticPaths() {
  return {
    paths: ['/static-ssg/first'],
    fallback: 'blocking',
  }
}

export function getStaticProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}
