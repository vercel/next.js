export default function Page({ post }) {
  return <p>post: {post}</p>
}

export const getServerSideProps = ({ params }) => {
  return {
    props: {
      post: params.post,
    },
  }
}
