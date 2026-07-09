import { Suspense } from 'react'

export const prefetch = 'allow-runtime'

export default async function Page({
  searchParams,
}: PageProps<'/blocking-page'>) {
  const sp = await searchParams

  return (
    <div>
      <p>Foo param: {sp.foo}</p>

      <Suspense fallback="Dynamic placeholder...">
        <DynamicData />
      </Suspense>
    </div>
  )
}

async function DynamicData() {
  await new Promise((resolve) => setTimeout(resolve, 1_000))

  return <p>Dynamic data</p>
}
