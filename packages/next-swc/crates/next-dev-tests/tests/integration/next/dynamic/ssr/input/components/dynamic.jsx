import dynamic from 'next/dynamic'

const Nested = dynamic(() => import('./nested'))
const NestedLoaded = dynamic(() => import('./nested-loaded'))

export default function Dynamic() {
  return (
    <div id="dynamic">
      dynamic
      <Nested />
      <NestedLoaded />
    </div>
  )
}
