import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/hello.js'))

const Dynamic = () => (
  <div className="dynamic-page">
    <Hello />
  </div>
)

export default Dynamic
