import dynamic from 'next/dynamic'

const Error = dynamic(import('../../components/crashing-in-component'))

export default Error
