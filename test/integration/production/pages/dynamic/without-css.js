import dynamic from 'next/dynamic'

const Hello = dynamic(import('../../components/without-css'))

export default Hello
