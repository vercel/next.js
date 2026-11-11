import { test, expect } from 'vitest'
import React from 'react'
import { render } from 'vitest-browser-react'
test('browser rendering helper cleans its component', async () => {
  const screen = await render(React.createElement('button', null, 'Save'))
  await expect
    .element(screen.getByRole('button', { name: 'Save' }))
    .toBeVisible()
})
