import { Suspense } from 'react'

async function AsyncComponent() {
  await new Promise<void>((resolve) => setTimeout(resolve, 100))
  return <div id="async-data">Async Data Loaded</div>
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {children}
      <Suspense fallback={<div>Loading async...</div>}>
        <AsyncComponent />
      </Suspense>
    </div>
  )
}
