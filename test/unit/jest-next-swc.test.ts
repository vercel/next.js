/* eslint-env jest */
import path from 'path'
// @ts-ignore
import hello from './fixtures/lib/hello.mjs'

describe('jest next-swc preset', () => {
  it('should have correct env', async () => {
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('should transpile .mjs file correctly', async () => {
    expect(hello()).toBe(path.join('hello', 'world'))
  })
})
