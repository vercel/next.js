import { useRouter } from 'next/router'

export default function Another(props) {
  const router = useRouter()

  return (
    <p id="router">
      {JSON.stringify({
        pathname: router.pathname,
        asPath: router.asPath,
        query: router.query,
        another: true,
      })}
    </p>
  )
}
