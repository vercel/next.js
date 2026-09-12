import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (id === 'missing') {
    notFound()
  }
  return <p id="nested-boundary-page">id: {id}</p>
}
