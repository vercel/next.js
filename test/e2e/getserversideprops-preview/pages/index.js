import { useRouter } from 'next/router'

export function getServerSideProps({ res, preview, previewData }) {
  // test override in preview mode
  res.setHeader('Cache-Control', 'public, max-age=3600')
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
