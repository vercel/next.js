import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { post, id } = router.query

  return (
    <>
      <p>
        Blog post {post} comment {id || '(all)'}
      </p>
    </>
  )
}
