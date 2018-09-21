/* eslint-disable */
import dynamic from 'next/dynamic'

const Hello = dynamic(import(/* webpackChunkName: 'hello1' */ '../../components/hello1'))
const Hello2 = dynamic(import(/* webpackChunkName: 'hello2' */ '../../components/hello2'))

export default () => <Hello />
