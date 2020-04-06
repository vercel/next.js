import { useRouter } from 'next/router'
import Modal from 'react-modal'
import Post from '../components/Post'
import PostCard from '../components/PostCard'

Modal.setAppElement('#__next')

const posts = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const Index = () => {
  const router = useRouter()

  return (
    <>
      <Modal
        isOpen={!!router.query.postId}
        onRequestClose={() => router.push('/')}
        contentLabel="Post modal"
      >
        <Post id={router.query.postId} />
      </Modal>
      <div className="postCardGrid">
        {posts.map((id, index) => (
          <PostCard key={index} id={id} />
        ))}
      </div>
    </>
  )
}

export default Index
