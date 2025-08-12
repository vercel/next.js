export const getStaticProps = ({ params }) => ({
  props: {
    post: params.post,
  },
})

export const getStaticPaths = () => {
  return {
    paths: [{ params: { post: 'post-1' } }, { params: { post: 'post-2' } }],
    fallback: true,
  }
}

export default function Post({ post }) {
  return `index post: ${post}`
}
