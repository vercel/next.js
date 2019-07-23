import { useRouter } from 'next/router'

const $comment = ({ gipQuery }) => {
  const router = useRouter()
  const { query } = router

  return (
    <>
      <p>
        I am {query.comment} on {query.post}
      </p>
      <span>gip {gipQuery && gipQuery.post}</span>
    </>
  )
}

$comment.getInitialProps = async ({ query }) => {
  return { gipQuery: query }
}

export default $comment
