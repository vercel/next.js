import Link from 'next/link'
import { useRouter } from 'next/router'

function SsrPage(props) {
  const router = useRouter()

  return (
    <>
      <p id="version">new</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">{JSON.stringify(router)}</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
      <br />
    </>
  )
}

export const getServerSideProps = ({
  params,
  locale = null,
  defaultLocale = null,
}) => {
  return {
    props: {
      slug: params.slug,
      locale,
      defaultLocale,
    },
  }
}

export default SsrPage
