import dynamic from 'next/dynamic'

const Nested2 = dynamic(() => import('./nested2'))

const Nested1 = () => (
  <div>
    Nested 1
    <Nested2 />
  </div>
)

export default Nested1
