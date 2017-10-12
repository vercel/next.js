import dynamic from 'next/dynamic'

const Error = dynamic(import('../../components/crashing-in-component'), { ssr: false })

export default Error
