import { useRouter } from 'next/router'

export const getStaticProps = ({ params }) => {
  return {
    props: {
      hello: 'world',
      params: params || null,
      random: Math.random(),
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/catch-all/hello'],
    fallback: true,
  }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="catch-all">optional catch-all page</p>
      <p id="router">{JSON.stringify(router)}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
