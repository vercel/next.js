import next from 'next'
import { join } from 'path'
const dir = join(__dirname, '../')
const warningMessage =
  "Warning: 'dev' is not a boolean which could introduce unexpected behavior. https://err.sh/next.js/invalid-server-options"

describe('Invalid server options', () => {
  test('next() called with no parameters should throw error', () => {
    expect(() => next()).toThrowError(
      'The server has not been instantiated properly. https://err.sh/next.js/invalid-server-options'
    )
  })

  test('next() called with undefined parameter should throw error', () => {
    expect(() => next(undefined)).toThrowError(
      'The server has not been instantiated properly. https://err.sh/next.js/invalid-server-options'
    )
  })

  test('next() called with null parameter should throw error', () => {
    expect(() => next(null)).toThrowError(
      'The server has not been instantiated properly. https://err.sh/next.js/invalid-server-options'
    )
  })

  test('next() called with dev as string should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = 'string'
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as number should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = 123
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as array should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = ['array']
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as object should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = { test: 'goes here' }
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as function should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = () => console.log('test')
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })
})
