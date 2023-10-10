import dynamic from 'next/dynamic'

const DynamicSSRFalse = dynamic(() => import('./ssr-false-module'), {
  ssr: false,
})

export default function page() {
  return (
    <div>
      <DynamicSSRFalse />
      <p id="content">dynamic-edge</p>
    </div>
  )
}

// export const runtime = 'edge'
