import Foo, { Foo2 } from '../components/foo.client'
// import Foo from '../components/foo'

export default function Index() {
  return (
    <div>
      <h1>only running on the server</h1>
      <p>process.versions: {JSON.stringify(process.versions)}</p>
      <Foo />
      <Foo2 />
    </div>
  )
}
