import { useRouter } from 'next/router'
import Link from 'next/link'
import Header from '../../../components/header'

export default function Post() {
  const router = useRouter()
  const { id } = router.query

  return (
    <>
      <Header />
      <h1>Post: {id}</h1>
      <ul>
        <li>
          <Link href="/post/[id]/[comment]" as={`/post/${id}/first-comment`}>
            First comment
          </Link>
        </li>
        <li>
          <Link href="/post/[id]/[comment]" as={`/post/${id}/second-comment`}>
            Second comment
          </Link>
        </li>
      </ul>
    </>
  )
}
