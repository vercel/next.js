import dynamic from 'next/dynamic'

const Nested = dynamic(() => import('./nested'), {
  ssr: false,
})
const NestedLoaded = dynamic(() => import('./nested-loaded'), {
  ssr: false,
})

export default function Dynamic() {
  return (
    <div id="dynamic">
      dynamic
      <Nested />
      <NestedLoaded />
    </div>
  )
}
