import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function DynamicValue() {
  const value =
    (await cookies()).get('cc-output-export-recovery')?.value ?? 'missing'
  return <p>Dynamic cookie: {value}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading dynamic Flight</p>}>
      <DynamicValue />
    </Suspense>
  )
}
