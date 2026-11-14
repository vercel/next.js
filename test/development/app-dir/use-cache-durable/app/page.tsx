import { unstable_cacheDurable } from 'next/cache'
import { getModuleValue } from './cached'
import Client from './client'

export default async function Page() {
  async function getInlineValue() {
    'use cache: remote'
    unstable_cacheDurable()
    return 'inline durable value'
  }

  return (
    <>
      <p id="inline-value">{await getInlineValue()}</p>
      <p id="module-value">{await getModuleValue()}</p>
      <Client />
    </>
  )
}
