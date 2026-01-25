import { Suspense } from 'react'
import { getSentinelValue } from '../../getSentinelValue'

async function fetchData() {
  // Simulate an async data fetch
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      resolve('Fetched Data')
    }, 100)
  })
}

async function AsyncComponent() {
  const data = await fetchData()
  return <div id="async-data">Data: {data}</div>
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div id="layout">{getSentinelValue()}</div>
      {children}
      <Suspense fallback={<div>Loading async...</div>}>
        <AsyncComponent />
      </Suspense>
    </div>
  )
}
