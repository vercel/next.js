import dynamic from 'next/dynamic'

const Hello = dynamic(() => import('../components/hello'))

export default () => (
  <>
    <Hello />
  </>
)
