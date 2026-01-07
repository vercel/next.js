import React from 'react'
import dynamic from 'next/dynamic'

const NamedExport = dynamic(() =>
  import('../components/named').then((mod) => mod.NamedExport)
)

export default function Dynamic() {
  return <NamedExport />
}
