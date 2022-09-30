import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/dynamic-css/no-css'))

export default Hello
