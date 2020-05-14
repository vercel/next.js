import dynamic from 'next/dynamic'

const Hello = dynamic(
  import(/* webpackChunkName: 'hello-world' */ '../../components/with-css')
)

export default Hello
