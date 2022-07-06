import { useRouter } from 'next/router'

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export default function Page(props) {
  const router = useRouter()
  return (
    <>
      <p id="slug-page">[slug] page</p>
      <p id="router">{JSON.stringify(router)}</p>
    </>
  )
}
