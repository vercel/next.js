import dynamic from 'next/dynamic'

const Hello = dynamic(() => import('../components/hello'))

const DynamicTwo = () => (
  <div>
    <Hello />
  </div>
)

export default DynamicTwo
