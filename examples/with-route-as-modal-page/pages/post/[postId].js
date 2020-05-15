import { useRouter } from 'next/router'
import Modal from 'react-modal'
import Post from '../../components/Post'
import PostCard from '../../components/PostCard'

Modal.setAppElement('#__next')

const posts = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function PostModalPage({ indexPage, postId }) {
  const router = useRouter()

  if (indexPage) return <GalleryBlock />

  return (
    <>
      <Modal
        // Displaying the modal on the page as open is somewhat contrived
        // `posts` is the same array used to generate paths (getStaticPaths) but this could all be based on remote data
        // Still this shows that we can use dynamic routes & static paths to achieve modal pages that also contain the 'gallery' view
        isOpen={true}
        onRequestClose={() => router.push('/')}
        contentLabel={`Post Modal for ${postId}`}
      >
        <Post id={postId} />
      </Modal>
      <GalleryBlock />
    </>
  )
}

function GalleryBlock() {
  return (
    <div className="postCardGrid">
      {posts.map((id, index) => (
        <PostCard key={index} id={id} />
      ))}
    </div>
  )
}

export function getStaticProps({ params: { postId } }) {
  if (postId === 'index') return { props: { indexPage: true } }
  return { props: { postId: postId } }
}

export function getStaticPaths() {
  let paths = [...posts, 'index']
  return {
    paths: paths.map(postId => ({ params: { postId: postId.toString() } })),
    fallback: false,
  }
}
