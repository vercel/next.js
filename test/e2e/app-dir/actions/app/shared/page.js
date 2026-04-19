import { Server } from './server'
import { Client } from './client'

export default async function Page() {
  return (
    <>
      <hr />
      <Server />
      <hr />
      <Client />
    </>
  )
}
