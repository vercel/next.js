export function getStaticProps({ preview, previewData }) {
  return {
    props: {
      preview: preview || false,
      previewData: previewData || null,
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="page">/preview</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
