import ReactDOM from 'react-dom'

import Foo from '../components/foo.client'
// import Foo from '../components/foo'

export default function Index() {
  return (
    <div>
      <p id="react-dom-version">ReactDOM.version: {ReactDOM.version}</p>
      <p>process.versions: {JSON.stringify(process.versions)}</p>
      <Foo />
    </div>
  )
}
