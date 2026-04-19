export const getStaticPaths = async () => {
  return {
    paths: [],
    fallback: 'blocking',
  }
}
export const getStaticProps = async () => {
  return {
    notFound: true,
  }
}

export default function Page() {
  return <p>slug</p>
}
