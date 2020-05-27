const Post = ({ id, pathname }) => {
  return (
    <div className="post">{`I am the article ${id}; my pathname is: ${pathname}`}</div>
  )
}

export default Post
