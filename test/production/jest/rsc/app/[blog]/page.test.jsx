/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Page from './page'

it('works with code using Next server APIs', () => {
  render(<Page params={{ blog: 'Jane' }} />)
  expect(screen.getByRole('heading')).toHaveTextContent('All about Jane')
})
