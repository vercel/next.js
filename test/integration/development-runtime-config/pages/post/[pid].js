const Post = () => {
  return (
    <div>
      <h2>POST</h2>
    </div>
  )
}

export const getStaticProps = async () => {
  return {
    props: {},
  }
}

export const getStaticPaths = async () => {
  return {
    paths: ['/post/1', '/post/2'],
    fallback: true,
  }
}

export default Post
