'use client'

import dynamic from 'next/dynamic'

const DynamicHeader = dynamic(() => import('./dynamic-component'), {
  loading: () => <p>Loading...</p>,
})

const ClientWrapper = () => {
  return (
    <div>
      <DynamicHeader />
    </div>
  )
}

export default ClientWrapper
