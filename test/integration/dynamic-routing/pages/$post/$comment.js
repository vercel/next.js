import { useRouter } from 'next/router'

const $comment = ({ gipParams }) => {
  const router = useRouter()
  const { params } = router

  return (
    <>
      <p>I am {params.comment} on {params.post}</p>
      <span>gip {gipParams && gipParams.post}</span>
    </>
  )
}

$comment.getInitialProps = async ({ params }) => {
  return {
    gipParams: params
  }
}

export default $comment
