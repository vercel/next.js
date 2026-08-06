import { ClientComponent } from './client'

async function getLargeObject() {
  'use cache'

  return { hello: 'world' }
}

export default async function Page() {
  return (
    <>
      <ClientComponent data={await getLargeObject()}>
        <p>foo</p>
      </ClientComponent>
      <ClientComponent data={await getLargeObject()}>
        <p>bar</p>
      </ClientComponent>
    </>
  )
}
