import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientComponent from './page'

test('App Router: Works with Client Components', () => {
  render(<ClientComponent />)
  expect(
    screen.getByRole('heading', { level: 1, name: 'Client Component' })
  ).toBeDefined()
})
