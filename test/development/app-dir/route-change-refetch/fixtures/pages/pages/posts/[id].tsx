import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return <p id="dynamic">dynamic {String(router.query.id)}</p>
}
