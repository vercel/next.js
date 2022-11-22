import dynamic from 'next/dynamic'

const Foo = dynamic(() => import('../components/foo'))

export default () => (
  <div>
    <Foo />
  </div>
)
