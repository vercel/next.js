import { useRouter } from 'next/router'

export function getStaticProps({ preview, previewData }) {
  return {
    props: {
      hasProps: true,
      preview: !!preview,
      previewData: previewData || null,
    },
  }
}

export default function ({ hasProps, preview, previewData }) {
  return (
    <>
      <pre id="props-pre">
        {hasProps
          ? JSON.stringify(preview) + ' and ' + JSON.stringify(previewData)
          : 'Has No Props'}
      </pre>
      <p id="router">{JSON.stringify(useRouter())}</p>
    </>
  )
}
