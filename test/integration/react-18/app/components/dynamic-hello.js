import { Suspense } from 'react'
import dynamic from 'next/dynamic'

let ssr
const suspense = false

const Hello = dynamic(() => import('./hello'), {
  ssr,
  suspense,
})

export default function DynamicHello(props) {
  return (
    <Suspense fallback={'loading'}>
      <Hello {...props} />
    </Suspense>
  )
}
