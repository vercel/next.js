export const getServerSideProps = ({ params }) => ({
  props: {
    post: params.post,
  },
})

export default function Post({ post }) {
  return `index post: ${post}`
}
