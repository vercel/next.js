import { useRouter } from 'next/router'

export default function DynamicRoutes() {
  const { query } = useRouter()

  return (
    <main>
      <h1 id="route-name">{query.routeName}</h1>
    </main>
  )
}
