import { useRouter } from 'next/router'

export default function Home(props) {
  const router = useRouter()
  return (
    <>
      <p id="info">id page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{`pathname ${router.pathname}`}</p>
      <p id="asPath">{`asPath ${router.asPath}`}</p>
    </>
  )
}

export async function getServerSideProps({ params }) {
  return {
    props: {
      random: Math.random() + Date.now(),
      id: true,
      params,
    },
  }
}
