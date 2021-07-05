/* eslint-disable */
import dynamic from 'next/dynamic'

const Hello = dynamic(
  import(/* webpackChunkName: 'hello1' */ '../../components/hello3')
)
const Hello2 = dynamic(
  import(/* webpackChunkName: 'hello2' */ '../../components/hello4')
)

const MultipleModules = () => {
  return (
    <div>
      <Hello />
      <Hello />
      <Hello />
      <Hello />
      <Hello />
      <Hello />
      <Hello />
    </div>
  )
}

export default MultipleModules
