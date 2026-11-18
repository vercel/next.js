import { type ReactNode, Suspense } from 'react'

type Params = { slug: string }

export default function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<Params>
}) {
  return (
    <>
      <Suspense fallback={<p>Loading param data...</p>}>
        <Inner params={params} />
      </Suspense>
      <hr />
      {children}
    </>
  )
}

async function Inner({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <p>Slug from layout: {slug}</p>
}
