/**
 * @jest-environment jsdom
 */
/* eslint-env jest */
import { isEqualNode } from 'next/dist/client/head-manager'

const createScriptElement = (attrs = {}) => {
  const el = document.createElement('script')
  for (const k in attrs) el.setAttribute(k, attrs[k])
  return el
}

describe('isEqualNode', () => {
  it('should equal itself', () => {
    const el = createScriptElement()
    expect(isEqualNode(el, el)).toBe(true)
  })

  it('should equal equivalent node that has no nonce', () => {
    const el1 = createScriptElement()
    const el2 = createScriptElement()
    expect(isEqualNode(el1, el2)).toBe(true)
  })

  it('should equal equivalent node that has same nonce property, even if the original node has no html nonce attribute value', () => {
    const el1 = createScriptElement({ nonce: 'abc123' })
    // Simulate Chrome/FF browser behavior of stripping off nonce value when adding element to the document
    el1.setAttribute('nonce', '')
    el1.nonce = 'abc123'
    const el2 = createScriptElement({ nonce: 'abc123' })
    expect(isEqualNode(el1, el2)).toBe(true)
  })

  it('should not equal node with different nonce value', () => {
    const el1 = createScriptElement({ nonce: 'abc123' })
    // Simulate Chrome/FF browser behavior of stripping off nonce value when adding element to the document
    el1.setAttribute('nonce', '')
    el1.nonce = 'abc123'
    const el2 = createScriptElement({ nonce: 'xyz' })
    expect(isEqualNode(el1, el2)).toBe(false)
  })

  it('should not equal node with different html attribute value', () => {
    const el1 = createScriptElement({ src: '1.js' })
    const el2 = createScriptElement({ src: '2.js' })
    expect(isEqualNode(el1, el2)).toBe(false)
  })
})
