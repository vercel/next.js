import { useRouter } from 'next/router'

export default function Index() {
  const router = useRouter()

  return (
    <>
      <p id="as-path">{router.asPath}</p>
      <p id="index">index</p>
    </>
  )
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
    revalidate: 1,
  }
}
