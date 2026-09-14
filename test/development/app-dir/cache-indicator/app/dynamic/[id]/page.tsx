// A blocking route (`instant = false`) with a dynamic param and no
// `generateStaticParams`. The `'use cache'` read sits after `await params`, so
// it can only run once the param resolves, in the runtime stage.
export const instant = false

async function getCachedValue() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return new Date().toISOString()
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await params
  const value = await getCachedValue()
  return <p id="dynamic">{value}</p>
}
