export default function Post(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}

export const getStaticProps = ({ preview, previewData, params }) => {
  return {
    props: {
      params,
      preview: !!preview,
      previewData: previewData || null,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: ['/no-fallback/first'],
    fallback: false,
  }
}
