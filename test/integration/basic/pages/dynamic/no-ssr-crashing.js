import dynamic from 'next/dynamic'

const Error = dynamic(import('../../components/crashing'), { ssr: false })

export default Error
