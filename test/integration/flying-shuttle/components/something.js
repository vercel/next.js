import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('./something2'))

export default () => (
  <>
    <div>lol</div>
    <DynamicComponent />
  </>
)
