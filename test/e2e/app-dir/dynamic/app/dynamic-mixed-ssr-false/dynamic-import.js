import dynamic from 'next/dynamic'

const DynamicSSRFalse = dynamic(() => import('./ssr-false-module'), {
  ssr: false,
})

export default function page() {
  return (
    <div>
      <DynamicSSRFalse />
      <p id="content">dynamic-mixed-ssr-false</p>
    </div>
  )
}
