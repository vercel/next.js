import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return <pre id="query-value">{JSON.stringify(router.query, null, 2)}</pre>
}
