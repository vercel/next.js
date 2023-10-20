import { Foo as FooRenamed } from './client'

export default function Page() {
  return (
    <>
      <h1>hi</h1>
      <FooRenamed />
    </>
  )
}
