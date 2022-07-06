import { useRouter } from 'next/router'

export default function Index(props) {
  const router = useRouter()

  return (
    <p id="router">
      {JSON.stringify({
        pathname: router.pathname,
        asPath: router.asPath,
        query: router.query,
        index: true,
      })}
    </p>
  )
}
