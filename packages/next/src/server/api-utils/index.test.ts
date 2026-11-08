import type { IncomingMessage } from 'http'
import { setLazyProp } from './index'

function setLazy(req: object, prop: string, getter: () => unknown): void {
  setLazyProp({ req: req as IncomingMessage }, prop, getter)
}

const plainProperty = { configurable: true, enumerable: true, writable: true }

describe('setLazyProp', () => {
  it('should call the getter on the first read and keep its value as a plain property', () => {
    const req: Record<string, unknown> = {}
    const getter = jest.fn(() => 'value')
    setLazy(req, 'cookies', getter)

    expect(getter).not.toHaveBeenCalled()
    expect(req.cookies).toBe('value')
    expect(req.cookies).toBe('value')
    expect(getter).toHaveBeenCalledTimes(1)
    expect(Object.getOwnPropertyDescriptor(req, 'cookies')).toEqual({
      ...plainProperty,
      value: 'value',
    })
  })

  it('should keep the lazy properties of an object that inherits from a request apart from those of the request', () => {
    const req: Record<string, unknown> = {}
    setLazy(req, 'cookies', () => 'request')
    const child: Record<string, unknown> = Object.create(req)
    setLazy(child, 'cookies', () => 'child')

    expect(child.cookies).toBe('child')
    expect(req.cookies).toBe('request')
    expect(Object.getOwnPropertyDescriptor(child, 'cookies')).toEqual({
      ...plainProperty,
      value: 'child',
    })
    expect(Object.getOwnPropertyDescriptor(req, 'cookies')).toEqual({
      ...plainProperty,
      value: 'request',
    })
  })
})
