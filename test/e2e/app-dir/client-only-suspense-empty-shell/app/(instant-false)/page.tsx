import { Client } from '../client'
import { PageSentinel } from '../sentinel'

export const instant = false

export default async function Page() {
  return (
    <>
      <PageSentinel />
      <Client />
    </>
  )
}
