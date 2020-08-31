import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/dynamic'))

const Page = () => {
  return (
    <div>
      Hi!
      <DynamicComponent />
    </div>
  )
}

export default Page
