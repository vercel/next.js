import Foo from '../components/Foo'
import Bar from '../components/Bar'

export const config = { amp: true }

const Styled = () => (
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

export default Styled
