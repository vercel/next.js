import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/dynamic-css/with-css'))

export default Hello
