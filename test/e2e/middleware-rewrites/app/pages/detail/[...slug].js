import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Detail() {
  const router = useRouter()

  return (
    <div style={{ textAlign: 'center' }}>
      <Link href="/">Home</Link>

      <pre>{JSON.stringify(router.query)}</pre>
    </div>
  )
}
