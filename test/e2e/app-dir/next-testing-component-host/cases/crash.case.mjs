import { it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

it('crashes after mounting so the parent must reclaim resources', async () => {
  const resource = await browser()
  await resource.mount('greeting', { label: 'crash' })
  console.log('H3_COMPONENT_READY_FOR_CRASH')
  process.exit(29)
})
