import { Suspense } from 'react'
async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="partial-param">{slug}</p>
}
export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <p>Partial shell</p>
      <Suspense fallback={<p>Loading server params</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
