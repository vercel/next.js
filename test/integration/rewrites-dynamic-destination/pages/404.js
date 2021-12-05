import Link from 'next/link'
import { useRouter } from 'next/router'

function NotFoundPage(props) {
  const router = useRouter()

  return (
    <>
      <p id="not-found">not found</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">{JSON.stringify(router)}</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
    </>
  )
}

export const getStaticProps = ({ locale = null, defaultLocale = null }) => {
  return {
    props: {
      locale,
      defaultLocale,
      is404: true,
    },
  }
}

export default NotFoundPage
