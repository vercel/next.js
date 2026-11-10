import * as m from './module'

// Checks that code after an (unconditional) `return` is removed, while
// declarations that are hoisted out of the removed code are kept.
function expectCode(fn, { kept = [], removed = [] }) {
  const code = fn.toString()
  for (const k of kept) {
    expect(code).toContain(k)
  }
  for (const r of removed) {
    expect(code).not.toContain(r)
  }
}

it('stops evaluating a module after a top-level return', () => {
  expect(globalThis.z1Called).toBe(true)
  expect(globalThis.z2Called).toBeUndefined()
})

it('removes code after an early return in an if block', () => {
  expectCode(m.a, {
    kept: [
      'a1()',
      // hoisted declarations are kept
      'var a3',
      'function a4()',
      'var a5',
      'a8',
      'a10',
      'a11',
      'a12',
      'a15',
      'a17',
      'a18',
      'a19',
      'function a20()',
      'var a28',
    ],
    removed: ['a2()', 'a6', 'a7', 'a9', 'a21()', 'a22', 'a23', 'a24', 'a25'],
  })
  expectCode(m.b, { kept: ['b1()'], removed: ['b2()', 'b3()'] })
  expectCode(m.c, { removed: ['c1()'] })
  expectCode(m.d, { removed: ['d1()', 'd2()'] })
})

it('removes code after an early return in an else block', () => {
  expectCode(m.e, { removed: ['e1()', 'e2()'] })
  expectCode(m.f, { removed: ['f1()'] })
  expectCode(m.g, { kept: ['g2()'], removed: ['g1()', 'g3()'] })
  expectCode(m.h, { kept: ['h1()'], removed: ['h2()'] })
})

it('keeps code after a conditional return', () => {
  expectCode(m.i, { kept: ['i1()', 'i2()'] })
  expectCode(m.j, { kept: ['i1()', 'i2()'] })
})

it('removes code after a return in class members', () => {
  expectCode(m.K, {
    kept: ['k1()', 'k2()', 'k4()', 'k5()', 'l1()', 'l2()', 'l3()', 'm1()'],
    removed: ['k3()', 'l4()', 'l5()', 'm3()', 'n2()'],
  })
  expectCode(Object.getOwnPropertyDescriptor(m.K.prototype, 'm').get, {
    kept: ['m1()'],
    removed: ['m2()'],
  })
  expectCode(Object.getOwnPropertyDescriptor(m.K.prototype, 'm').set, {
    kept: ['m1()', 'm2()'],
    removed: ['m3()'],
  })
  expectCode(m.K, { kept: ['n1()', 'n3()', 'n4()', 'n5()'] })
})

it('removes code after a return in nested functions and blocks', () => {
  expectCode(m.p, { kept: ['p1()', 'p3()'], removed: ['p2()', 'p4()'] })
  expectCode(m.q, { kept: ['q1()', 'q3()'], removed: ['q2()'] })
  expectCode(m.r, { kept: ['r1()'], removed: ['r2()', 'r3()'] })
})
