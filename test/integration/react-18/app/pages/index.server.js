import ReactDOM from 'react-dom'

// import Foo from '../components/foo.client'
import Foo from '../components/foo'

export default function Index() {
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
      <Foo />
    </div>
  )
}
