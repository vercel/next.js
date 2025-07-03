/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Component from './component'

it('works with client-only code', () => {
  render(<Component />)
  expect(screen.getByRole('heading')).toHaveTextContent('0')
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('heading')).toHaveTextContent('1')
})
