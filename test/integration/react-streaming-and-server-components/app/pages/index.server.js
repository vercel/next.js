import Foo from '../components/foo.client'

export default function Index() {
  return (
    <div>
      <h1>{`thisistheindexpage.server`}</h1>
      <Foo />
    </div>
  )
}
