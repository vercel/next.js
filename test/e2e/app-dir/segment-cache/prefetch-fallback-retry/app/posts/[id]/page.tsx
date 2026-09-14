import { Suspense } from 'react'
type Params = { id: string }
export function generateStaticParams() {
  return [{ id: 'prerendered' }]
}
export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p id="shell">App shell for posts</p>}>
        <ParamsDependent params={params} />
      </Suspense>
    </main>
  )
}
async function ParamsDependent({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <p id="post-content">{`Post body for ${id}`}</p>
}
