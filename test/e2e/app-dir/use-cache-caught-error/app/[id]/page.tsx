async function getValue(id: string) {
  'use cache'

  throw new Error(`Cached function failed: ${id}`)
}

export function generateStaticParams() {
  return [{ id: 'static' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    await getValue(id)
  } catch {
    return <p>fallback</p>
  }
}
