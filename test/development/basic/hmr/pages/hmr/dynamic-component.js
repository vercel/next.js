import React from 'react'
import dynamic from 'next/dynamic'

const HmrDynamic = dynamic(import('../../components/hmr/dynamic'))

export default function Page() {
  return <HmrDynamic />
}
