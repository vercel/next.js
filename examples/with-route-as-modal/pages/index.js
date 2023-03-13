import { useRouter } from 'next/router'
import Modal from 'react-modal'
import Post from '../components/Post'
import Grid from '../components/Grid'

Modal.setAppElement('#__next')

const Index = () => {
  const router = useRouter()

  return (
    <>
      <Modal
        isOpen={!!router.query.postId}
        onRequestClose={() => router.push('/')}
        contentLabel="Post modal"
      >
        <Post id={router.query.postId} pathname={router.pathname} />
      </Modal>
      <Grid />
    </>
  )
}

export default Index
