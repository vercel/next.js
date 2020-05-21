import Link from 'next/link'

const PostCard = ({ id }) => {
  return (
    <Link href={`/?postId=${id}`} as={`/post/${id}`}>
      <a className="postCard">{id}</a>
    </Link>
  )
}

export default PostCard
