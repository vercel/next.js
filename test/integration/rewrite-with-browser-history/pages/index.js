import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()

  return (
    <>
      <p id="index">index page</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>

      <br />
    </>
  )
}

export const getServerSideProps = () => {
  return { props: {} }
}
