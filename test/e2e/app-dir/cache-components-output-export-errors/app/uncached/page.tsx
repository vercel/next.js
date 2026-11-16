import { Suspense } from 'react'

async function Content() {
  const response = await fetch(`${process.env.CC_EXPORT_DATA_URL}/uncached`, {
    cache: 'no-store',
  })
  return <p>{await response.text()}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Content />
    </Suspense>
  )
}
