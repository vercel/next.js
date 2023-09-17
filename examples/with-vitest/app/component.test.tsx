import { expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Component from './component'

test('App Router: Works with Client Components (React State)', () => {
  render(<Component />)
  expect(screen.getByRole('heading', { level: 2, name: '0' })).toBeDefined()
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('heading', { level: 2, name: '1' })).toBeDefined()
})
