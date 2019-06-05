import dynamic from 'next/dynamic'

const Hello = dynamic(
  import(
    /* webpackChunkName: 'hello-world' */ '../../components/hello-chunkfilename'
  )
)

export default Hello
