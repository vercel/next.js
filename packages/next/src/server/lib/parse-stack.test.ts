import { parseStack } from './parse-stack'

describe('parseStack', () => {
  it('returns empty array for empty string', () => {
    expect(parseStack('')).toEqual([])
  })

  it('parses a basic stack frame', () => {
    const stack = `Error: boom
    at myFunc (file:///app/foo.ts:10:5)`
    const frames = parseStack(stack)
    expect(frames[0]).toEqual({
      file: 'file:///app/foo.ts',
      methodName: 'myFunc',
      arguments: [],
      line1: 10,
      column1: 5,
    })
  })

  it('rewrites /_next/static/ URLs to distDir', () => {
    const stack = `Error
    at fn (http://localhost:3000/_next/static/chunks/app.js:1:1)`
    const [frame] = parseStack(stack, '/home/user/project/.next')
    expect(frame.file).toBe(
      'file:///home/user/project/.next/static/chunks/app.js'
    )
  })

  it('rewrites /_next/static/immutable/ URLs to distDir', () => {
    const stack = `Error
    at fn (http://localhost:3000/_next/static/immutable/chunks/app.js:1:1)`
    const [frame] = parseStack(stack, '/home/user/project/.next')
    expect(frame.file).toBe(
      'file:///home/user/project/.next/static/immutable/chunks/app.js'
    )
  })

  it('does not rewrite /_next/ URL when distDir is not provided', () => {
    const stack = `Error
    at fn (http://localhost:3000/_next/static/chunks/app.js:1:1)`
    const [frame] = parseStack(stack, undefined)
    expect(frame.file).toBe('http://localhost:3000/_next/static/chunks/app.js')
  })

  it('strips trailing slash from distDir when rewriting', () => {
    const stack = `Error
    at fn (http://localhost:3000/_next/static/chunks/app.js:1:1)`
    const [frame] = parseStack(stack, '/project/.next/')
    expect(frame.file).toBe('file:///project/.next/static/chunks/app.js')
  })

  it('normalises Windows backslashes in distDir', () => {
    const stack = `Error
    at fn (http://localhost:3000/_next/static/chunks/app.js:1:1)`
    const [frame] = parseStack(stack, 'C:\\project\\.next')
    expect(frame.file).toBe('file://C:/project/.next/static/chunks/app.js')
  })

  it('handles eval frames without throwing', () => {
    const stack = `Error
    at eval (eval at <anonymous> (file:///app/foo.ts:5:1), <anonymous>:1:1)`
    expect(() => parseStack(stack)).not.toThrow()
  })

  it('preserves query string when rewriting static URL', () => {
    const stack = `Error
    at fn (http://localhost:3000/_next/static/chunks/app.js?v=1:1:1)`
    const [frame] = parseStack(stack, '/project/.next')
    expect(frame.file).toBe('file:///project/.next/static/chunks/app.js?v=1')
  })
})
