'use client'

import dynamic from 'next/dynamic'

const DynamicHeader = dynamic(() => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(import('./dynamic-component'))
    }, 1000)
  })
})

const Page = () => {
  return (
    <div>
      <DynamicHeader />
    </div>
  )
}

export default Page
