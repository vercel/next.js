import { trace } from '@opentelemetry/api'
import { cookies } from 'next/headers'
import EarlyClient from '../client-component-loading/early-client'
import LateClient from '../client-component-loading/late-client'
import ActionOnlyClient from './action-only-client'

export default async function Page() {
  const marker =
    (await cookies()).get('client-component-action-marker')?.value ?? 'none'
  const capturedClient = ActionOnlyClient

  async function setMarker(formData: FormData) {
    'use server'
    if (!capturedClient) {
      throw new Error('Missing captured client component')
    }
    const value = formData.get('marker')
    if (typeof value !== 'string') {
      throw new Error('Missing action marker')
    }
    ;(await cookies()).set('client-component-action-marker', value)
    trace
      .getTracer('client-component-loading-test')
      .startSpan('test.serverActionCompleted')
      .end()
  }

  return (
    <>
      <EarlyClient />
      <LateClient />
      <p id="action-result">{marker}</p>
      <form action={setMarker}>
        <input type="hidden" name="marker" value="action-completed" />
        <button type="submit">Run action</button>
      </form>
    </>
  )
}
