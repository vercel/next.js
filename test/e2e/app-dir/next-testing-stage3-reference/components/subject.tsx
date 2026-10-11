import { cookies } from 'next/headers'
import { Counter } from './counter'
import { serverValue } from './server-value'

export default async function Subject({ initial }: { initial: number }) {
  return (
    <section id="subject">
      <p id="server-value">{await serverValue()}</p>
      <p id="visitor">
        {(await cookies()).get('l3-visitor')?.value ?? 'anonymous'}
      </p>
      <Counter initial={initial} />
    </section>
  )
}
