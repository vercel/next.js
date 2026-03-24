import A from './a'
import './b'
import './c'
import D from './d'
import './e'
import './f'

import a from './dep?a'
import b from './dep?b'
import c from './dep?c'
import d from './dep?d'
import e from './dep?e'
import f from './dep?f'

it('should generate valid code', () => {
  expect(A()).toBe('x')
  expect(new D().method()).toBe('x')
})

it('a should be used', () => {
  expect(a).toBe(true)
})

if (process.env.NODE_ENV === 'production') {
  it('b should be unused', () => {
    expect(b).toBe(false)
  })
}

it('c should be used', () => {
  expect(c).toBe(true)
})

if (process.env.NODE_ENV === 'production') {
  it('d should be used', () => {
    expect(d).toBe(true)
  })

  it('e should be unused', () => {
    expect(e).toBe(false)
  })
}

it('f should be used', () => {
  expect(f).toBe(true)
})
