import { it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

it('waits for externally owned cancellation after mounting', async () => {
  const resource = await browser()
  await resource.mount('greeting', { label: 'cancel' })
  console.log('H3_COMPONENT_READY_FOR_CANCEL')
  await new Promise(() => {})
})
