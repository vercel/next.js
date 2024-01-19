/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import Component from './client-component'

it('works with client-only code', () => {
  render(<Component />)
  expect(screen.getByRole('heading')).toHaveTextContent('Hello')
})
