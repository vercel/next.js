import { test, expect } from 'vitest'
test('happy-dom retains URL and DOM state', () => {
  expect(window.location.href).toBe('https://release.example/fixture')
  expect(document.createElement('div').tagName).toBe('DIV')
})
