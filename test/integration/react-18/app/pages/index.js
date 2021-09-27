import ReactDOM from 'react-dom'

// import Foo from '../components/foo.client'
import Foo from '../components/foo'

export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
      <Foo />
    </div>
  )
}
