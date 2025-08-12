import { useRouter } from 'next/router'

export default function Home(props) {
  const router = useRouter()
  return (
    <>
      <p id="info">blog slug page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="pathname">{`pathname ${router.pathname}`}</p>
      <p id="asPath">{`asPath ${router.asPath}`}</p>
    </>
  )
}

export async function getStaticProps({ params }) {
  return {
    revalidate: 1,
    props: {
      random: Math.random() + Date.now(),
      blogSlug: true,
      params,
    },
  }
}

export async function getStaticPaths() {
  return {
    paths: ['/blog/first'],
    fallback: 'blocking',
  }
}
