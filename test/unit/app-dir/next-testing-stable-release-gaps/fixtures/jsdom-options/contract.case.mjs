import { test, expect } from 'vitest'
test('DOM options are applied', () => {
  expect(document.URL).toBe('https://release.example/fixture')
  document.body.innerHTML = '<button>save</button>'
  expect(document.querySelector('button').textContent).toBe('save')
})
