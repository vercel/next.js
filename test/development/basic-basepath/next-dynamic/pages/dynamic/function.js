import dynamic from 'next/dynamic'

const Hello = dynamic(() => import('../../components/hello1'))

export default Hello
