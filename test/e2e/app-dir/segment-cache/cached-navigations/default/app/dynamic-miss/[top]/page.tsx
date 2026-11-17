import { Suspense } from 'react'
import { connection } from 'next/server'
import ParamsPage from '../../fully-static-params/[top]/page'

export function generateStaticParams() {
  return [{ top: 'known' }]
}

async function Content({ params }: { params: Promise<{ top: string }> }) {
  const { top } = await params
  if (top === 'known') {
    await connection()
  }
  return <ParamsPage params={params} />
}

export default function Page(props: { params: Promise<{ top: string }> }) {
  return (
    <Suspense fallback={<p>Loading dynamic result</p>}>
      <Content {...props} />
    </Suspense>
  )
}
