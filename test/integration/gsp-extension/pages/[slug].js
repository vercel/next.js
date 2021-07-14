export default function Slug() {
  return 'slug'
}

export const getStaticProps = () => ({ props: {} })

export const getStaticPaths = () => {
  return {
    paths: [
      { params: { slug: '1' } },
      { params: { slug: '2.ext' } },
      { params: { slug: '3.html' } },
    ],
    fallback: false,
  }
}
