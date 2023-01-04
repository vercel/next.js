import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="page">/news</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="asPath">{router.asPath}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
    </>
  )
}

export function getStaticProps() {
  console.log('getStaticProps /news')
  return {
    props: {
      news: true,
      now: Date.now(),
    },
  }
}
