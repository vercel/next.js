export const getServerSideProps = ({ params }) => ({
  props: {
    post: params.post,
  },
})

export default function Comment({ post }) {
  return `comments post: ${post}`
}
