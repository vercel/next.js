import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/with-css'))

export default Hello
