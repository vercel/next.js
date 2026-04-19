'use client'

import dynamic from 'next/dynamic'

const Dynamic = dynamic(
  () => import('mixed-syntax-esm').then((mod) => mod.Component),
  { ssr: false }
)

export default function Page() {
  return <Dynamic />
}
