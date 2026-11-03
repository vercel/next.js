async function getHandler() {
  'use cache'
  return (globalThis as any).__testCacheHandler as string
}

export async function generateStaticParams() {
  return [{ handler: await getHandler() }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ handler: string }>
}) {
  return <p>{(await params).handler}</p>
}
