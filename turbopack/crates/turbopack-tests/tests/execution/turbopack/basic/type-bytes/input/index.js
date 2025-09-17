import './polyfill'
import bytes from './data.bin' with { type: 'turbopack-bytes' }

it('import type:bytes should work', () => {
  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(new TextDecoder().decode(bytes)).toBe('this is some data\n')
})
