import * as PostPage from './post/[postId]'

export const getStaticProps = () =>
  PostPage.getStaticProps({
    params: { postId: 'index' },
  })

export default PostPage.default
