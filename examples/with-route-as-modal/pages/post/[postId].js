import { useRouter } from 'next/router'
import Modal from 'react-modal'
import Post from '../../components/Post'
import Grid from '../../components/Grid'

Modal.setAppElement('#__next')

const PostPage = () => {
  const router = useRouter()
  const { postId } = router.query

  return (
    <>
      <Modal
        isOpen={!!postId}
        onRequestClose={() => router.push('/')}
        contentLabel="Post modal"
      >
        <Post id={postId} pathname={router.pathname} />
      </Modal>
      <Grid />
    </>
  )
}

export default PostPage
