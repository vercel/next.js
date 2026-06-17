import { headers } from 'next/headers'

import ClientConsolePage from './client'

let i = 0

export default async function ConsolePage() {
  const data = headers().then(() => null)

  const outBadge = `:::${i}:out:::`
  const errBadge = `:::${i++}:err:::`
  console.log(
    `${outBadge} /console-after-abort/client: logging before prerender abort`
  )

  return (
    <ClientConsolePage data={data} outBadge={outBadge} errBadge={errBadge} />
  )
}
