import { id } from 'next/root-params'

export default async function Page() {
  return <p>hello world {JSON.stringify({ id: await id() })}</p>
}
