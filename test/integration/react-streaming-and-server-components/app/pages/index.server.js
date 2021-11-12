import Foo from '../components/foo.client'

const envVar = process.env.ENV_VAR_TEST

export default function Index() {
  return (
    <div>
      <h1>{`thisistheindexpage.server`}</h1>
      <div>{envVar}</div>
      <div>
        <Foo />
      </div>
    </div>
  )
}
