/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Page from './page'

it('works with server-only imported code', () => {
  render(<Page />)
  expect(screen.getByRole('heading')).toHaveTextContent('3.14')
})
