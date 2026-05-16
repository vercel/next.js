import { Suspense } from 'react'
import { StatefulClientComponent } from './stateful-client-component'

export default async function Page({
  params,
}: {
  params: Promise<{ n: string }>
}) {
  const { n } = await params
  return (
    <>
      <h2>Page {n}</h2>
      <div>
        <Suspense fallback={<div>Loading...</div>}>
          <StatefulClientComponent n={n} />
        </Suspense>
      </div>
    </>
  )
}

export function generateStaticParams() {
  return [{ n: '1' }, { n: '2' }]
}
