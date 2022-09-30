import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="page">/blog/[slug]</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="asPath">{router.asPath}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  console.log('getStaticProps /blog/[slug]', params)
  return {
    props: {
      params,
      now: Date.now(),
    },
  }
}

export function getStaticPaths() {
  return {
    paths: ['/blog/first'],
    fallback: 'blocking',
  }
}
