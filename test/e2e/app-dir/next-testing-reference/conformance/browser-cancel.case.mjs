import { it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

// The independent host driver waits for this marker before signalling the CLI.
it('retains artifacts when the browser run is cancelled', async ({
  signal,
}) => {
  const { page } = await browser()
  await page.goto('/', { timeout: 30000 })
  console.log('L_BROWSER_READY_FOR_CANCEL')
  await new Promise((resolve) => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', resolve, { once: true })
  })
})

it('does not run after cancellation', () => {
  throw new Error('L_BROWSER_CASE_AFTER_CANCEL')
})
