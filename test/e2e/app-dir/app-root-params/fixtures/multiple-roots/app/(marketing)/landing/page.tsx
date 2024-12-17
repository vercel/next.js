import { unstable_rootParams } from 'next/server'

export default async function Page() {
  return <p>hello world {JSON.stringify(await unstable_rootParams())}</p>
}
