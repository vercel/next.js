import { useRouter } from 'next/router'
import Link from 'next/link'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="another">another page</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>

      <Link href="/" as="/">
        <a id="to-index">Go back to index</a>
      </Link>
      <br />
    </>
  )
}

export const getServerSideProps = () => {
  return { props: {} }
}
