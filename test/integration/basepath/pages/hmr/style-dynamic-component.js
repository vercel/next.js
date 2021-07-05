import React from 'react'
import dynamic from 'next/dynamic'

const HmrDynamic = dynamic(import('../../components/hmr/dynamic'))

const StyleDynamicComponent = () => {
  return <HmrDynamic />
}

export default StyleDynamicComponent
