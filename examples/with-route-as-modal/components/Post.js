const Post = ({ id, pathname }) => {
  return (
    <div className="post">{`I am the post ${id}; my pathname is: ${pathname}`}</div>
  )
}

export default Post
