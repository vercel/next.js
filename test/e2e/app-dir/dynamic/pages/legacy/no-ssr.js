import dynamic from 'next/dynamic'

const PureClient = dynamic(() => import('../../ui/pure-client'), { ssr: false })

export default PureClient
