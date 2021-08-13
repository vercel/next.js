import dynamic from 'next/dynamic'

const PixiComponent = dynamic(() => import('../components/PixiComponent'), {
  ssr: false,
})

export default function IndexPage() {
  return (
    <div>
      <PixiComponent />
    </div>
  )
}
