import { useRouter } from 'next/router'

export default function Home(props) {
  const router = useRouter()
  return (
    <>
      <p id="info">index page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{`pathname ${router.pathname}`}</p>
      <p id="asPath">{`asPath ${router.asPath}`}</p>
    </>
  )
}

export async function getStaticProps() {
  return {
    revalidate: 1,
    props: {
      random: Math.random() + Date.now(),
      index: true,
    },
  }
}
