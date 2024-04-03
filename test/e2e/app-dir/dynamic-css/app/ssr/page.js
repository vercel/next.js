'use client'
import React, { useState } from 'react'
import dynamic from 'next/dynamic'

const AsyncFooDynamic = dynamic(() => import('../../components/foo'))
async function getAsyncFoo() {
  const AsyncFoo = (await import('../../components/foo')).default
  console.log('AsyncFoo', AsyncFoo)
  return AsyncFoo
}

export default function Page() {
  const [Comp, setComp] = React.useState(null)

  // console.log('Comp', Comp)
  return (
    <div>
      {/* <button onClick={() => {
        getAsyncFoo().then((AsyncFoo) => {
          setComp(() => AsyncFoo)
        })
      }}>
        load component
        
      </button>
      {Comp && <Comp />} */}
      <AsyncFooDynamic />
    </div>
  )
}
