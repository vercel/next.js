import dynamic from 'next/dynamic'

const DynamicStaticImg = dynamic(() => import('../../components/static-img'), {
  ssr: false,
})

export default () => {
  return (
    <div>
      <DynamicStaticImg />
    </div>
  )
}
