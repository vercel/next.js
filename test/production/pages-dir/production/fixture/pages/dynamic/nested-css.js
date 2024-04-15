import dynamic from 'next/dynamic'

const Component = dynamic(
  import('../../components/dynamic-css/nested/with-css')
)

export default Component
