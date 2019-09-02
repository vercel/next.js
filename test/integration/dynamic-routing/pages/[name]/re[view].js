import { useRouter } from 'next/router'

const $comment = ({ gipQuery }) => {
  const router = useRouter()
  const { query } = router

  return (
    <>
      <p>
        I {query.view} on {query.name}
      </p>
      <span>gip {gipQuery && gipQuery.name}</span>
    </>
  )
}

$comment.getInitialProps = async ({ query }) => {
  return { gipQuery: query }
}

export default $comment