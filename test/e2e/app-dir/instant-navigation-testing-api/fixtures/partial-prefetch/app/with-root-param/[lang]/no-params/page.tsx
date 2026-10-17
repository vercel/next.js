import { Suspense } from 'react'
import { lang } from 'next/root-params'

export default function Page() {
  return (
    <div>
      <h1 data-testid="title">Root Params Page</h1>
      <Suspense
        fallback={
          <div data-testid="root-params-fallback">Loading params...</div>
        }
      >
        <RootParamContent />
      </Suspense>
    </div>
  )
}

async function RootParamContent() {
  const currentLang = await lang()
  return <div data-testid="root-param-value">lang: {currentLang}</div>
}
