import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="blog">/blog/[slug]</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="as-path">{router.asPath}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: ['/ssg/first'],
    fallback: 'blocking',
  }
}
