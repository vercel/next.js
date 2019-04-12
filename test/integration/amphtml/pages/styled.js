import Foo from '../components/Foo'
import Bar from '../components/Bar'
import { withAmp } from 'next/amp'

export default withAmp(() => (
  <div>
    <Foo />
    <Bar />
    <style jsx global>{`
      body {
        background-color: green;
      }
    `}</style>
  </div>
))
