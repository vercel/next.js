import dynamic from 'next/dynamic'

const PureClient = dynamic(import('../../components/pure-client'), {
  ssr: false,
})

export default PureClient
