import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/hello-error'), { ssr: false })

export default Hello
