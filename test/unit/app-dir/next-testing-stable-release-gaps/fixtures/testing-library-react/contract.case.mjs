import { test, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
afterEach(cleanup)
test('component and third-party DOM matchers run unchanged', () => {
  render(React.createElement('button', null, 'Save'))
  expect(screen.getByRole('button', { name: 'Save' })).toBeVisible()
})
