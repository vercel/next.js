import { useRouter } from 'next/router'
import Link from 'next/link'

export default function IndexPage() {
  const router = useRouter()
  return (
    <>
      <span>{router.query.param}</span>
      <Link href="/b">
        <a>To "b"</a>
      </Link>
    </>
  )
}
