import Button from './client-component'
import { headers } from 'next/headers'
export default async function Page() {
  const headerStore = await headers()
  const headerValue = headerStore.get('test') || 'empty'

  return (
    <>
      <h1 id={`header-${headerValue}`}>Header value: {headerValue}</h1>
      <Button value="a">Set A</Button>
      <Button value="b">Set B</Button>
      <Button value="c">Set C</Button>
    </>
  )
}
