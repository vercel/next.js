import { useRouter } from 'next/router'

export default () => {
  const router = useRouter()
  const { author } = router.query

  if (!author) {
    return <p>All quotes here</p>
  }

  return (
    <>
      <p>Quote by author {author} here</p>
    </>
  )
}
