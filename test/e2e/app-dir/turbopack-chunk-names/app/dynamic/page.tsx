'use client'

import dynamic from 'next/dynamic'

const DynWidget = dynamic(
  () => import(/* turbopackChunkName: "dyn-widget" */ './dyn-widget')
)

export default function Page() {
  return (
    <main>
      <DynWidget />
    </main>
  )
}
