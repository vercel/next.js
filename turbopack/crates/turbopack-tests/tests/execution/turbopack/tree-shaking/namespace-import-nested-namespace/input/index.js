import * as lib from './lib'
import * as receiverLib from './receiver-lib'
import * as escapeLib from './escape-lib'

it('should narrow a member read through a namespace reached via a namespace import', () => {
  expect(new lib.core.CoreError('x')).toBeInstanceOf(Error)
  expect(lib.string()).toBe('string')
  expect(lib.core.unusedInfo).toBe(false)
})

it('should keep the receiver of a method call through the nested namespace', () => {
  const receiver = receiverLib.core.self()
  expect(typeof receiver).toBe('object')
  expect(receiver.CoreError).toBe(receiverLib.core.CoreError)
})

it('should keep the whole nested namespace when it escapes', () => {
  const ns = escapeLib.core
  expect(Object.keys(ns)).toContain('unused')
  expect(escapeLib.core.unusedInfo).toBe(true)
})
