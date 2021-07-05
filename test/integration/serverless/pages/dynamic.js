import dynamic from 'next/dynamic'

const Hello = dynamic(() => import('../components/hello'))

const Dynamic = () => (
  <div>
    <Hello />
  </div>
)

export default Dynamic
