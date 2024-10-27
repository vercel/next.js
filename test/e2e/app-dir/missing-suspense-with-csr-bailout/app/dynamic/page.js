'use client'

import dynamic from 'next/dynamic'

const Dynamic = dynamic(() => import('./dynamic'), {
  ssr: false,
})

export default () => {
  return <Dynamic />
}
