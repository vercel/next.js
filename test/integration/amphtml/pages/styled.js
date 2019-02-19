import Foo from '../components/Foo'
import Bar from '../components/Bar'

export default () => (
  <>
    <Foo />
    <Bar />
    <style jsx global>{`
      body {
        background-color: green;
      }
    `}</style>
  </>
)
