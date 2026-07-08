import { Client } from '../../client'
import { PageSentinel } from '../../sentinel'

export default async function Page() {
  return (
    <>
      <PageSentinel />
      <Client />
    </>
  )
}
