/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import Link from 'next/link'

test('single child', () => {
  render(<Link href="https://nextjs.org/blog/next-13">Hello world</Link>)
  expect(screen.getByRole('link')).not.toBeNull()
})

test('multiple child with default legacyBehavior', () => {
  render(
    <Link href="https://nextjs.org/blog/next-13">
      <span>Hello world</span>
      <span>!</span>
    </Link>
  )
  expect(screen.getByRole('link')).not.toBeNull()
})

test('multiple child with forced legacyBehavior=false', () => {
  render(
    <Link href="https://nextjs.org/blog/next-13" legacyBehavior={false}>
      <span>Hello world</span>
      <span>!</span>
    </Link>
  )
  expect(screen.getByRole('link')).not.toBeNull()
})
