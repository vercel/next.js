import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Modal from 'react-modal'
import Article from '../../components/Article'
import { data } from '../../components/Grid'

Modal.setAppElement('#__next')

const ArticlePage = ({ articleId }) => {
  const router = useRouter()

  useEffect(() => {
    router.prefetch('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Modal
        isOpen={true} // The modal should always be shown on page load, it is the 'page'
        onRequestClose={() => router.push('/')}
        contentLabel="Post modal"
      >
        <Article id={articleId} pathname={router.pathname} />
      </Modal>
    </>
  )
}

export default ArticlePage

export function getStaticProps({ params: { articleId } }) {
  return { props: { articleId: articleId } }
}

export function getStaticPaths() {
  return {
    paths: data.map((articleId) => ({
      params: { articleId: articleId.toString() },
    })),
    fallback: false,
  }
}
