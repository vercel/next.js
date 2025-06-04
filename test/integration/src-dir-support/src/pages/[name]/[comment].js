import { useRouter } from 'next/router'

const Comment = ({ gipQuery }) => {
  const router = useRouter()
  const { query } = router

  return (
    <>
      <p id={query.comment}>
        I am {query.comment} on {query.name}
      </p>
      <span>gip {gipQuery && gipQuery.name}</span>
    </>
  )
}

Comment.getInitialProps = async ({ query }) => {
  return { gipQuery: query }
}

export default Comment
