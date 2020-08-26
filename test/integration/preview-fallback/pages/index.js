export const getStaticProps = ({ preview, previewData }) => {
  return {
    props: {
      preview: !!preview,
      previewData: previewData || null,
    },
  }
}

export default function Index(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
