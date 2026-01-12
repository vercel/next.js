import { Suspense } from 'react'
import { notFound } from 'next/navigation'

async function fetchData() {
  // Simulate fetching data that doesn't exist
  await new Promise((resolve) => setTimeout(resolve, 100))
  return null // Data not found
}

async function DataComponent() {
  const data = await fetchData()
  if (!data) {
    notFound()
  }
  return <p>Data: {data}</p>
}

async function AnotherAsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return <p id="fetched-data">Fetched Data</p>
}

export default function Page() {
  return (
    <div>
      <p id="before-suspense">Before Suspense</p>
      <Suspense fallback={<p>Loading data...</p>}>
        <DataComponent />
      </Suspense>
      <Suspense fallback={<p>Loading more...</p>}>
        <AnotherAsyncComponent />
      </Suspense>
    </div>
  )
}
