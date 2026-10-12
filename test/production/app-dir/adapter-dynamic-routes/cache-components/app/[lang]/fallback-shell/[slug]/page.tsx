import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'two' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>loading</p>}>
      {params.then(({ slug }) => (
        <p>{slug}</p>
      ))}
    </Suspense>
  )
}
