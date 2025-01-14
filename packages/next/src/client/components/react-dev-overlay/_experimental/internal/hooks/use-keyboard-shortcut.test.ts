/**
 * @jest-environment jsdom
 */
/* eslint-disable import/no-extraneous-dependencies */
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcut } from './use-keyboard-shortcut'
import { MODIFIERS } from './use-keyboard-shortcut'

describe('useKeyboardShortcut', () => {
  let addEventListenerSpy: jest.SpyInstance
  let removeEventListenerSpy: jest.SpyInstance

  beforeEach(() => {
    addEventListenerSpy = jest.spyOn(window, 'addEventListener')
    removeEventListenerSpy = jest.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should add and remove event listener', () => {
    const callback = jest.fn()
    const { unmount } = renderHook(() =>
      useKeyboardShortcut({
        key: 'k',
        callback,
        modifiers: [MODIFIERS.CTRL_CMD],
      })
    )

    // When used `expect.any(Function)`, received:
    // error TS21228: [ban-function-calls] Constructing functions from strings can lead to XSS.
    const eventListener = addEventListenerSpy.mock.calls[0][1]
    expect(typeof eventListener).toBe('function')
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', eventListener)

    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalled()
  })

  it('should trigger callback when correct key and modifier are pressed', () => {
    const callback = jest.fn()
    renderHook(() =>
      useKeyboardShortcut({
        key: 'k',
        callback,
        modifiers: [MODIFIERS.CTRL_CMD],
      })
    )

    // Simulate keydown event with Cmd/Ctrl + K
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
      })
    )

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should work with multiple modifiers', () => {
    const callback = jest.fn()
    renderHook(() =>
      useKeyboardShortcut({
        key: 'k',
        callback,
        modifiers: [MODIFIERS.CTRL_CMD, MODIFIERS.SHIFT],
      })
    )

    // Should not trigger with just Cmd/Ctrl
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
      })
    )
    expect(callback).not.toHaveBeenCalled()

    // Should trigger with Cmd/Ctrl + Shift
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        shiftKey: true,
      })
    )
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should be case insensitive', () => {
    const callback = jest.fn()
    renderHook(() =>
      useKeyboardShortcut({
        key: 'k',
        callback,
        modifiers: [MODIFIERS.CTRL_CMD],
      })
    )

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'K', // uppercase
        metaKey: true,
      })
    )

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should prevent default event behavior', () => {
    const callback = jest.fn()
    renderHook(() =>
      useKeyboardShortcut({
        key: 'k',
        callback,
        modifiers: [MODIFIERS.CTRL_CMD],
      })
    )

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
    })
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault')

    window.dispatchEvent(event)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })
})
