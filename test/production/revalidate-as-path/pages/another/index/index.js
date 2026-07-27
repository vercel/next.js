import { useRouter } from 'next/router'

export default function Another() {
  const router = useRouter()

  return (
    <>
      <p id="as-path">{router.asPath}</p>
      <p id="another">another</p>
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
