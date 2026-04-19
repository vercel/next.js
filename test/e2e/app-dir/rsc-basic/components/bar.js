import Foo from './foo'

export default function Bar() {
  return (
    <div id="bar">
      {`bar.server.js: `}
      <Foo />
    </div>
  )
}
