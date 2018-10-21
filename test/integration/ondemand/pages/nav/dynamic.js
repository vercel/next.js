import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/hello.js'))

export default () => (
  <div className='dynamic-page'>
    <Hello />
  </div>
)
