import { useRouter } from 'next/router'

export const getStaticProps = ({ params }) => {
  return {
    props: {
      id: params.id,
    },
  }
}

export const getStaticPaths = () => ({
  paths: ['first', 'second'].map((id) => ({ params: { id } })),
  fallback: true,
})

export default ({ id }) =>
  useRouter().isFallback ? `loading...` : `hello from /groups/[id] ${id}`
