import dynamic from 'next/dynamic'

const Component = dynamic(
  import('../../components/dynamic-css/many-modules/with-css')
)

export default Component
