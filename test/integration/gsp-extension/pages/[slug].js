export default function Page({ value }) {
  return value
}

export const getStaticProps = ({ params }) => ({
  props: {
    value: params.slug,
  },
})

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
