'use client'

import dynamic from 'next/dynamic'

const Pathfinder = dynamic(
  () => import('@pathfinder-ide/react').then((mod) => mod.Pathfinder),
  { ssr: false }
)

export default function Page() {
  return (
    <div style={{ height: '100vh', padding: 200, backgroundColor: '#111' }}>
      <Pathfinder />
    </div>
  )
}
