import Loadable from 'react-loadable'

const Hello = Loadable({
  loader: () => import('../../components/hello1'),
  loading () {
    return <div>Loading...</div>
  }
})

export default Hello
