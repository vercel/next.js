import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Post() {
  const router = useRouter()
  return (
    <div>
      <h3>Post #{router.query.id}</h3>
      <p>Lorem ipsum</p>
      <Link href="/blog">
        <a>Back to blog</a>
      </Link>
    </div>
  )
}
