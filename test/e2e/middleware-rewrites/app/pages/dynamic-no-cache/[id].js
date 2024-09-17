export default function Dynamic({ id }) {
  return (
    <main id="dynamic-page">
      <h1>Page {id}</h1>
    </main>
  )
}

export const getStaticProps = async ({ params }) => {
  return {
    props: {
      id: params.id,
    },
  }
}

export const getStaticPaths = async () => {
  return {
    paths: [{ params: { id: '1' } }, { params: { id: '2' } }],
    fallback: false,
  }
}
