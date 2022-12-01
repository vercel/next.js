import { previewData } from 'next/headers'

export default function Page() {
  const previewDataResult = previewData()

  return (
    <main>
      <pre id="preview-data">
        {JSON.stringify({ previewData: previewDataResult })}
      </pre>
    </main>
  )
}

export const generateStaticParams = async () => {
  const paths = [
    {
      route: [],
    },
    {
      route: ['test'],
    },
    {
      route: ['test-2'],
    },
  ]

  return paths
}
