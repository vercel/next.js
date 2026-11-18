import { Suspense } from 'react'

export function generateStaticParams() {
  return Array.from({ length: 12 }, (_, id) => ({ id: String(id) }))
}

async function Item({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <p>item {id}</p>
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading item</p>}>
      <Item {...props} />
    </Suspense>
  )
}
