import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Page from './page'

// Disables a package that checks that code is only executed on the server side.
// Also, this mock can be defined in the Vitest setup file.
vi.mock('server-only', () => {
  return {}
})

test('App Router: Works with Server Components', () => {
  render(<Page />)
  expect(
    screen.getByRole('heading', { level: 1, name: 'App Router' })
  ).toBeDefined()
})
