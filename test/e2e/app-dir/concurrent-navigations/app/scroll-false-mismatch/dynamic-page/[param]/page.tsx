import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateStaticParams() {
  return [{ param: 'a' }, { param: 'b' }]
}

async function DynamicContent({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}

export default async function Page({
  params,
}: PageProps<'/scroll-false-mismatch/dynamic-page/[param]'>) {
  const { param } = await params
  return (
    <div>
      {/* Tall content so that the scroll position can be preserved. */}
      <div style={{ height: 6000 }} />
      <Suspense
        fallback={
          <div
            id={`dynamic-page-loading-${param}`}
          >{`Loading ${param}...`}</div>
        }
      >
        <DynamicContent>
          <div
            id={`dynamic-page-content-${param}`}
          >{`Dynamic page ${param}`}</div>
        </DynamicContent>
      </Suspense>
    </div>
  )
}
