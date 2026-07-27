import { connection } from 'next/server'
import { Suspense } from 'react'

export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  // All params at this level are root params, so we should be able
  // to access them without blocking the app shell.
  const { lang } = await params
  return (
    <>
      {/* The fallback is the App Shell — the part of the page that
          doesn't depend on non-root params. */}
      <Suspense
        fallback={
          <p id="shell">{`App shell for page with root param: ${lang}`}</p>
        }
      >
        <Dynamic />
      </Suspense>
    </>
  )
}

async function Dynamic() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
