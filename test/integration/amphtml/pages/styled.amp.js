import Foo from '../components/Foo'
import Bar from '../components/Bar'

export default () => (
  <div>
    <Foo />
    <Bar />
    <style jsx global>{`
      body {
        background-color: green;
      }
    `}</style>
  </div>
)
