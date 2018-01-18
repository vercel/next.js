import dynamic from 'next/dynamic'

const Error = dynamic(import('../../components/crashing'))

export default Error
