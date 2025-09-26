import React from 'react'
import dynamic from 'next/dynamic'

const NextDynamicRedButton = dynamic(() =>
  import('../../components/red-button').then((module) => module.RedButton)
)

export default function NextDynamic() {
  return <NextDynamicRedButton />
}
