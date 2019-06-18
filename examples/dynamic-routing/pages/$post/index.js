import { useRouter } from 'next/router'
import Link from 'next/link'
import Header from '../../components/header'

const $post = () => {
  const router = useRouter()
  const { post } = router.query

  return (
    <>
      <Header />
      <h1>Post: {post}</h1>
      <ul>
        <li>
          <Link href="/$post/$comment" as={`/${post}/first-comment`}>
            <a>First comment</a>
          </Link>
        </li>
        <li>
          <Link href="/$post/$comment" as={`/${post}/second-comment`}>
            <a>Second comment</a>
          </Link>
        </li>
      </ul>
    </>
  )
}

export default $post
