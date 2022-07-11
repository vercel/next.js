import Foo from './foo.client'

export default function Bar() {
  return (
    <div id="bar">
      {`bar.server.js: `}
      <Foo />
    </div>
  )
}
