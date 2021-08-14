import React from 'react'
import dynamic from 'next/dynamic'

const Hello = dynamic(() => import('../../components/hello'), {
  suspense: true,
})

export default function Unwrapped() {
  return <Hello />
}
