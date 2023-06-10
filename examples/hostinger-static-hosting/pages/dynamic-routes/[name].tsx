import { useRouter } from 'next/router'

export default function DynamicRouteExample() {
  const router = useRouter()
  const { name } = router.query
  return (
    <div>
      <h1>Dynamic Route</h1>
      <p>
        This is a dynamic page and the name you typed is <b>"{name}"</b>
      </p>
    </div>
  )
}
