import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="gssp">gssp page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
      <br />
    </>
  )
}

export const getServerSideProps = ({ query }) => {
  if (query.hiding) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      hello: 'world',
    },
  }
}
