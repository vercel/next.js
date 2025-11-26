import { action } from '../actions'
import { getFoo } from '../nested'

export default async function Page() {
  const foo = await getFoo()
  await action()
  await foo()
  return <>server</>
}

export const dynamic = 'force-dynamic'
