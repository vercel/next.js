/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import ClientComponent from './page'

it('App Router: Works with Client Components', () => {
  render(<ClientComponent />)
  expect(screen.getByRole('heading')).toHaveTextContent('Client Component')
})
