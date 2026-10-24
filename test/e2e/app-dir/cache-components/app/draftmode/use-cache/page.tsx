import { draftMode } from 'next/headers'

async function getCachedName(key: string): Promise<string> {
  'use cache'
  return `name:${key}`
}

export default async function Page() {
  const name = await getCachedName('nav')
  const { isEnabled } = await draftMode()

  return (
    <>
      <div id="cached-name">{name}</div>
      <div id="draft-mode">{String(isEnabled)}</div>
    </>
  )
}
