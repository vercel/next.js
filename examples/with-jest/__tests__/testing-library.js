import React from 'react'
import { render, screen } from '@testing-library/react'
import Index from '../pages/index'

describe('App', () => {
  it('renders a heading', () => {
    render(<Index />)

    const heading = screen.getByRole('heading', {
      name: /welcome to next\.js!/i,
    })

    expect(heading).toBeInTheDocument()
  })
})
