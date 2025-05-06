import next from 'next'
import { join } from 'path'
const dir = join(__dirname, '../')
const warningMessage =
  "Warning: 'dev' is not a boolean which could introduce unexpected behavior. https://nextjs.org/docs/messages/invalid-server-options"

describe('Invalid server options', () => {
  test('next() called with no parameters should throw error', () => {
    expect(() => {
      // @ts-expect-error deliberately omitting required argument
      return next()
    }).toThrow(
      'The server has not been instantiated properly. https://nextjs.org/docs/messages/invalid-server-options'
    )
  })

  test('next() called with undefined parameter should throw error', () => {
    expect(() => next(undefined)).toThrow(
      'The server has not been instantiated properly. https://nextjs.org/docs/messages/invalid-server-options'
    )
  })

  test('next() called with null parameter should throw error', () => {
    expect(() => next(null)).toThrow(
      'The server has not been instantiated properly. https://nextjs.org/docs/messages/invalid-server-options'
    )
  })

  test('next() called with dev as string should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = 'string'
    // @ts-expect-error deliberately passing incorrect value
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as number should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = 123
    // @ts-expect-error deliberately passing incorrect value
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as array should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = ['array']
    // @ts-expect-error deliberately passing incorrect value
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as object should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = { test: 'goes here' }
    // @ts-expect-error deliberately passing incorrect value
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })

  test('next() called with dev as function should send warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn')
    const dev = () => console.log('test')
    // @ts-expect-error deliberately passing incorrect value
    next({ dev, dir })

    expect(consoleSpy).toHaveBeenCalledWith(warningMessage)
  })
})
