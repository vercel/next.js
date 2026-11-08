import { declaredAction } from '../lib/declared/actions'
import { declaredCached } from '../lib/declared/cached'
import { declared } from '../lib/declared/page'
import { undeclared } from '../lib/undeclared/page'
import { read } from '../lib/use'
import { action } from './actions'
import { cached } from './cached'
import { Client } from './client'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const use = (await searchParams).use !== undefined
  const result = read(
    () => undeclared(),
    () => declared(),
    use
  )

  return (
    <main>
      <p id="result">{JSON.stringify(result)}</p>
      <p id="cached">{await cached()}</p>
      <p id="declared-cached">{await declaredCached()}</p>
      <Client action={action} declaredAction={declaredAction} />
    </main>
  )
}
