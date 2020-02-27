export function getStaticProps({ preview, previewData }) {
  return { props: { hasProps: true, preview, previewData } }
}

export default function({ hasProps, preview, previewData }) {
  if (!hasProps) {
    return <pre id="props-pre">Has No Props</pre>
  }

  return (
    <pre id="props-pre">
      {JSON.stringify(preview) + ' and ' + JSON.stringify(previewData)}
    </pre>
  )
}
