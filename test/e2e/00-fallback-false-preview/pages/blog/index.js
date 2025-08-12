import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="page">blog index</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{router.pathname}</p>
      <p id="asPath">{router.asPath}</p>
    </>
  )
}

export function getStaticProps() {
  console.log({ blogIndex: true })

  return {
    props: {
      random: Math.random() + Date.now(),
      blogIndex: true,
    },
    revalidate: 1,
  }
}
