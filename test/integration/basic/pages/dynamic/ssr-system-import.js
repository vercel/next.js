import dynamic from 'next/dynamic'

const Hello = dynamic(System.import('../../components/hello1'))

export default Hello
